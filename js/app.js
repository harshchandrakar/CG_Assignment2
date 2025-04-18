function checkWebGLContext(canvas) {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        throw new Error('WebGL not supported. Please use a browser that supports WebGL.');
    }
    
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.error('WebGL context lost!');
        alert('WebGL context lost. Please reload the page.');
    });
    
    canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored!');
        location.reload();
    });
    
    return gl;
}

class RotatingModelApp {
    constructor(modelFolder, modelNames) {
        this.canvas = document.getElementById('game-surface');
        if (!this.canvas) {
            console.error('Canvas element not found!');
            this.displayErrorToUser(new Error('Canvas element with ID "game-surface" not found.'));
            return;
        }
        this.modelCenters = [];
        this.canvas.width = window.innerWidth * 0.8;  
        this.canvas.height = window.innerHeight * 0.8;
        this.canvas.style.width = `${this.canvas.width}px`;
        this.canvas.style.height = `${this.canvas.height}px`;
        
        try {
            const gl = checkWebGLContext(this.canvas);
            this.renderer = new Renderer(this.canvas);
            
            gl.clearColor(0.2, 0.2, 0.2, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        } catch (error) {
            console.error('WebGL initialization error:', error);
            this.displayErrorToUser(error);
            return;
        }
        this.program = null;
        this.models = [];
        this.buffers = [];
        this.uniformLocations = {};
        this.modelFolder = modelFolder;
        this.modelNames = modelNames;
        this.modelBuffers = [];
        this.worldMatrix = new Float32Array(16);
        this.projMatrix = new Float32Array(16);
        this.movementController = new ObjectMovementController(this);
        this.trackball = new VirtualTrackball(this.canvas);
        
        this.selectedObjectIndex = -1;
        this.originalColors = [];
        this.highlightColor = [1.0, 0.5, 0.0];

        this.viewManager = new ViewManager(this);

        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleMouseClick = this.handleMouseClick.bind(this);
        this.init = this.init.bind(this);
    }
    
    calculateModelCenter(model) {
        let centerX = 0, centerY = 0, centerZ = 0;
        let vertexCount = model.vertices.length / 3;
        
        for (let i = 0; i < model.vertices.length; i += 3) {
            centerX += model.vertices[i];
            centerY += model.vertices[i+1];
            centerZ += model.vertices[i+2];
        }
        
        return {
            x: vertexCount > 0 ? centerX / vertexCount : 0,
            y: vertexCount > 0 ? centerY / vertexCount : 0,
            z: vertexCount > 0 ? centerZ / vertexCount : 0
        };
    }

    scaleModelVertices(model, scale = 0.5) {
        const scaledVertices = new Float32Array(model.vertices.length);
        for (let i = 0; i < model.vertices.length; i++) {
            scaledVertices[i] = model.vertices[i] * scale;
        }
        model.vertices = scaledVertices;
        return model;
    }

    calculateModelOffset(index, modelCount) {
        return [0, 0, 0];
    }

    applyModelOffset(model, offset) {
        const offsetVertices = new Float32Array(model.vertices.length);
        for (let i = 0; i < model.vertices.length; i += 3) {
            offsetVertices[i] = model.vertices[i] + offset[0];
            offsetVertices[i + 1] = model.vertices[i + 1] + offset[1];
            offsetVertices[i + 2] = model.vertices[i + 2] + offset[2];
        }
        model.vertices = offsetVertices;
        return model;
    }

    generateIndices(vertexCount) {
        const indices = new Uint16Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            indices[i] = i;
        }
        return indices;
    }

    generateUniqueColors(model, index) {
        const colorPalette = [
            [0.8, 0.2, 0.2],
            [0.2, 0.8, 0.2],
            [0.2, 0.2, 0.8],
            [0.8, 0.8, 0.2],
            [0.8, 0.2, 0.8],
            [0.2, 0.8, 0.8]
        ];
        
        const modelColor = colorPalette[index % colorPalette.length];
        const colors = new Float32Array(model.vertices.length);
        
        for (let i = 0; i < model.vertices.length / 3; i++) {
            colors[i * 3] = modelColor[0];
            colors[i * 3 + 1] = modelColor[1];
            colors[i * 3 + 2] = modelColor[2];
        }
        
        return colors;
    }

    async init() {
        try {
            console.log("Starting app initialization...");
            
            if (!this.renderer || !this.renderer.gl) {
                throw new Error('WebGL renderer not properly initialized');
            }
            
            const gl = this.renderer.gl;
            
            if (typeof glMatrix === 'undefined') {
                throw new Error('gl-matrix library is not loaded');
            }
            if (typeof OBJ === 'undefined') {
                throw new Error('webgl-obj-loader library is not loaded');
            }

            let vertexShaderSource, fragmentShaderSource;
            try {
                vertexShaderSource = await ShaderLoader.fetchShaderSource('shaders/vertex-shader.glsl');
                console.log("Vertex shader loaded");
            } catch (error) {
                throw new Error(`Failed to load vertex shader: ${error.message}`);
            }
            
            try {
                fragmentShaderSource = await ShaderLoader.fetchShaderSource('shaders/fragment-shader.glsl');
                console.log("Fragment shader loaded");
            } catch (error) {
                throw new Error(`Failed to load fragment shader: ${error.message}`);
            }

            try {
                this.program = await ShaderLoader.loadProgram(
                    gl, 
                    vertexShaderSource, 
                    fragmentShaderSource
                );
                console.log("Shader program created");
            } catch (error) {
                throw new Error(`Failed to create shader program: ${error.message}`);
            }

            try {
                this.validateProgram();
                console.log("Shader program validated");
            } catch (error) {
                throw new Error(`Program validation failed: ${error.message}`);
            }

            console.log(`Loading ${this.modelNames.length} models...`);
            for (let i = 0; i < this.modelNames.length; i++) {
                console.log(`Loading model ${i+1}/${this.modelNames.length}: ${this.modelNames[i]}`);
                let modelPath = `${this.modelFolder}/${this.modelNames[i]}`;
                
                try {
                    let model = await this.loadModelWithDetailing(modelPath);
                    
                    model = this.scaleModelVertices(model, 0.3);
                    
                    model.colors = this.generateUniqueColors(model, i);

                    if (!model.indices || model.indices.length === 0) {
                        console.warn(`Generating indices for model ${this.modelNames[i]}`);
                        model.indices = this.generateIndices(model.vertices.length / 3);
                    }

                    const modelCenter = this.calculateModelCenter(model);
                    this.modelCenters.push(modelCenter);
                    console.log(`Model ${this.modelNames[i]} center: (${modelCenter.x.toFixed(2)}, ${modelCenter.y.toFixed(2)}, ${modelCenter.z.toFixed(2)})`);

                    const modelBuffers = this.renderer.createBuffers(model);
                    
                    this.models.push(model);
                    this.buffers.push(modelBuffers);
                    this.modelBuffers.push(modelBuffers);
                    
                    this.originalColors.push(new Float32Array(model.colors));
                    
                    console.log(`Model ${this.modelNames[i]} loaded successfully`);
                } catch (error) {
                    console.error(`Failed to load model ${this.modelNames[i]}:`, error);
                    throw new Error(`Failed to load model ${this.modelNames[i]}: ${error.message}`);
                }
            }

            try {
                await this.viewManager.init(this.program);
                console.log("View manager initialized");
            } catch (error) {
                throw new Error(`View manager initialization failed: ${error.message}`);
            }
            
            try {
                await this.movementController.init();
                console.log("Movement controller initialized");
            } catch (error) {
                throw new Error(`Movement controller initialization failed: ${error.message}`);
            }
            
            this.buffers = [...this.modelBuffers, ...this.viewManager.axesBuffers];

            this.buffers.forEach((buffer, index) => {
                try {
                    this.renderer.setupAttributes(this.program, buffer);
                } catch (error) {
                    console.error(`Error setting up attributes for buffer ${index}:`, error);
                }
            });

            try {
                this.getUniformLocations();
                console.log("Uniform locations obtained");
            } catch (error) {
                throw new Error(`Failed to get uniform locations: ${error.message}`);
            }

            try {
                this.setupMatrices();
                console.log("Matrices set up");
            } catch (error) {
                throw new Error(`Failed to set up matrices: ${error.message}`);
            }

            window.addEventListener('keydown', this.handleKeyPress);
            this.canvas.addEventListener('click', this.handleMouseClick);

            console.log("Starting animation loop");
            this.startAnimationLoop();

            this.viewManager.displayViewModeInfo();
            
            console.log("App initialization completed successfully");
        } catch (error) {
            console.error('Initialization error:', error);
            this.displayErrorToUser(error);
        }
    }
    
    validateProgram() {
        const gl = this.renderer.gl;
        
        gl.validateProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.VALIDATE_STATUS)) {
            const errorLog = gl.getProgramInfoLog(this.program);
            console.error('Program validation error:', errorLog);
            throw new Error(`Program validation failed: ${errorLog}`);
        }
    }

    displayErrorToUser(error) {
        console.error('Error:', error);
        
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'absolute';
        errorDiv.style.top = '50%';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translate(-50%, -50%)';
        errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
        errorDiv.style.color = 'white';
        errorDiv.style.padding = '20px';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.maxWidth = '80%';
        errorDiv.style.zIndex = '9999';
        errorDiv.innerHTML = `
            <h2>Error</h2>
            <p>${error.message}</p>
            <p>Check the console for more details.</p>
            <button onclick="location.reload()">Reload Page</button>
        `;
        document.body.appendChild(errorDiv);
    }

    async loadModelWithDetailing(url) {
        try {
            const model = await OBJLoader.loadModel(url);
            
            console.group('Model Loading Details');
            console.log('Model:', url);
            console.log('Vertices count:', model.vertices.length / 3);
            console.log('Indices count:', model.indices ? model.indices.length : 0);
            
            if (model.vertices.length === 0) {
                throw new Error('No vertices found in the model');
            }
            if (!model.indices || model.indices.length === 0) {
                console.warn('No indices found, generating default indices');
                model.indices = this.generateIndices(model.vertices.length / 3);
            }
            
            console.groupEnd();
            
            return model;
        } catch (error) {
            console.error('Model loading failed:', error);
            throw error;
        }
    }

    getUniformLocations() {
        const gl = this.renderer.gl;
        
        this.uniformLocations = {
            mWorld: gl.getUniformLocation(this.program, 'mWorld'),
            mView: gl.getUniformLocation(this.program, 'mView'),
            mProj: gl.getUniformLocation(this.program, 'mProj')
        };

        Object.entries(this.uniformLocations).forEach(([name, location]) => {
            if (location === null) {
                console.warn(`Uniform ${name} not found in shader. This may cause rendering issues.`);
            }
        });
    }

    handleKeyPress(event) {
        this.viewManager.handleKeyPress(event);
    
        if (event.key === '[' || event.key === ']') {
            const speedChange = event.key === '[' ? -20 : 20;
            this.movementController.changeAnimationSpeed(speedChange);
            return;
        }
        
        if (this.selectedObjectIndex !== -1 && 
            !this.movementController.isAnimating &&
            this.viewManager.currentViewMode === 'topView') {
            
            const key = event.key.toLowerCase();
            const rotationStep = Math.PI/18;
            let rotationAxis = null;
    
            // Map arrow keys to rotation axes
            if (key === 'arrowup') rotationAxis = 'x';
            if (key === 'arrowleft') rotationAxis = 'y';
            if (key === 'arrowright') rotationAxis = 'z';
    
            if (rotationAxis) {
                // Create rotation quaternion
                const axisVec = {
                    x: rotationAxis === 'x' ? 1 : 0,
                    y: rotationAxis === 'y' ? 1 : 0,
                    z: rotationAxis === 'z' ? 1 : 0
                };
                
                const rotationQuat = glMatrix.quat.create();
                glMatrix.quat.setAxisAngle(rotationQuat, 
                    [axisVec.x, axisVec.y, axisVec.z], 
                    rotationStep
                );
                
                // Apply to trackball rotation
                glMatrix.quat.multiply(this.trackball.rotation, 
                    rotationQuat, 
                    this.trackball.rotation
                );
                
                // Force position update
                const model = this.models[this.selectedObjectIndex];
                if (model.currentPosition) {
                    this.movementController.updateModelPosition(model.currentPosition);
                }
            }
            // Handle scaling
            else if (key === 's' || key === 'x') {
                const scaleStep = 0.1;
                const model = this.models[this.selectedObjectIndex];
                model.scale = model.scale || 1.0;
                model.scale += (key === 's' ? scaleStep : -scaleStep);
                model.scale = Math.max(0.1, model.scale);
                if (model.currentPosition) {
                    this.movementController.updateModelPosition(model.currentPosition);
                }
            }
        }
    }

    handleMouseClick(event) {
        // If we're in the middle of defining a path, let the movement controller handle it
        if (this.movementController.isDefiningPath) {
            return;
        }
    
        if (this.viewManager.currentViewMode !== 'topView') {
            console.log('Object picking is only available in Top View mode.');
            return;
        }
    
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const ndcX = (x / this.canvas.width) * 2 - 1;
        const ndcY = (y / this.canvas.height) * 2 - 1;
        
        console.log(`Click at NDC coordinates: (${ndcX.toFixed(2)}, ${ndcY.toFixed(2)})`);
        this.movementController.handleObjectSelection(ndcX, ndcY);
    }

    setupMatrices() {
        const gl = this.renderer.gl;

        gl.useProgram(this.program);

        glMatrix.mat4.identity(this.worldMatrix);

        this.viewManager.setupViewMatrix();

        const degToRad = (deg) => deg * (Math.PI / 180);
        glMatrix.mat4.perspective(
            this.projMatrix, 
            degToRad(45), 
            this.canvas.clientWidth / this.canvas.clientHeight, 
            0.1, 
            1000.0
        );

        const uniformSetters = [
            { name: 'mWorld', matrix: this.worldMatrix },
            { name: 'mView', matrix: this.viewManager.viewModes[this.viewManager.currentViewMode].viewMatrix },
            { name: 'mProj', matrix: this.projMatrix }
        ];

        uniformSetters.forEach(({ name, matrix }) => {
            const location = this.uniformLocations[name];
            if (location !== null) {
                gl.uniformMatrix4fv(location, gl.FALSE, matrix);
            } else {
                console.warn(`Could not set ${name} matrix - location is null`);
            }
        });
    }

    startAnimationLoop() {
        const gl = this.renderer.gl;

        const loop = () => {
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            
            gl.useProgram(this.program);

            this.worldMatrix = new Float32Array(16);
            glMatrix.mat4.identity(this.worldMatrix);
            
            if (this.uniformLocations.mWorld !== null) {
                gl.uniformMatrix4fv(this.uniformLocations.mWorld, gl.FALSE, this.worldMatrix);
            }
            
            if (this.uniformLocations.mView !== null) {
                gl.uniformMatrix4fv(
                    this.uniformLocations.mView, 
                    gl.FALSE, 
                    this.viewManager.viewModes[this.viewManager.currentViewMode].viewMatrix
                );
            }
            
            gl.enable(gl.DEPTH_TEST);
            this.models.forEach((model, index) => {
                if (index >= this.modelNames.length) return;
                
                const buffers = this.buffers[index];
                this.renderer.setupAttributes(this.program, buffers);
                this.renderer.render(this.program, model);
            });
            
            gl.disable(gl.DEPTH_TEST);
            this.viewManager.axesModels.forEach((axisModel, index) => {
                this.renderer.setupAttributes(this.program, this.viewManager.axesBuffers[index]);
                this.renderer.render(this.program, axisModel);
            });
            
            gl.enable(gl.DEPTH_TEST);
            this.viewManager.drawAxisLabels();
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
    }
}

class VirtualTrackball {
    constructor(canvas) {
        this.canvas = canvas;
        this.rotation = glMatrix.quat.create();
        this.lastRotation = glMatrix.quat.create();
        this.isDragging = false;
        this.lastPos = [0, 0];

        // Event listeners
        canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }

    screenToSphere(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const px = ((x - rect.left) / rect.width) * 2 - 1;
        const py = ((rect.top + rect.height - y) / rect.height) * 2 - 1;
        const length = px*px + py*py;
        
        if(length > 1) {
            return [px / Math.sqrt(length), py / Math.sqrt(length), 0];
        }
        return [px, py, Math.sqrt(1 - length)];
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.lastPos = this.screenToSphere(e.clientX, e.clientY);
        glMatrix.quat.copy(this.lastRotation, this.rotation);
    }

    handleMouseMove(e) {
        if(!this.isDragging) return;
        
        const currPos = this.screenToSphere(e.clientX, e.clientY);
        const axis = glMatrix.vec3.cross([], this.lastPos, currPos);
        const angle = glMatrix.vec3.distance(this.lastPos, currPos) * 2;
        
        glMatrix.quat.setAxisAngle(this.rotation, axis, angle);
        glMatrix.quat.multiply(this.rotation, this.rotation, this.lastRotation);
    }

    handleMouseUp() {
        this.isDragging = false;
    }

    getRotationMatrix() {
        const matrix = glMatrix.mat4.create();
        return glMatrix.mat4.fromQuat(matrix, this.rotation);
    }
}

window.onload = async () => {
    const modelFolder = 'models';
    const modelNames = ['cup4.obj', 'random2.obj', 'cube.obj'];
    const app = new RotatingModelApp(modelFolder, modelNames);
    await app.init();
};