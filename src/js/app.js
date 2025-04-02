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
    }

    handleMouseClick(event) {
        if (this.viewManager.currentViewMode !== 'topView') {
            console.log('Object picking is only available in Top View mode.');
            return;
        }
    
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const ndcX = (x / this.canvas.width) * 2 - 1;
        const ndcY = -((y / this.canvas.height) * 2 - 1);
        
        console.log(`Click at NDC coordinates: (${ndcX.toFixed(2)}, ${ndcY.toFixed(2)})`);
        
        const modelIndex = this.pickObject(ndcX, ndcY);
        
        console.log(`Picked model index: ${modelIndex}`);
        
        if (modelIndex !== -1 && modelIndex < this.models.length) {
            this.selectObject(modelIndex);
        } else {
            if (this.selectedObjectIndex !== -1) {
                this.resetSelection();
            }
        }
    }
    
    resetSelection() {
        if (this.selectedObjectIndex !== -1 && this.selectedObjectIndex < this.models.length) {
            console.log(`Resetting selection: ${this.selectedObjectIndex}`);
            
            const originalColorArray = this.originalColors[this.selectedObjectIndex];
            const model = this.models[this.selectedObjectIndex];
            
            model.colors = new Float32Array(originalColorArray);
            
            const gl = this.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.selectedObjectIndex].colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, model.colors, gl.STATIC_DRAW);
            
            const infoDiv = document.getElementById('selection-info');
            if (infoDiv) {
                infoDiv.remove();
            }
            
            this.selectedObjectIndex = -1;
        }
    }

    pickObject(ndcX, ndcY) {
        const rayOrigin = [ndcX * 5, 5, ndcY * 5];
        const rayDirection = [0, -1, 0];
        
        let closestModelIndex = -1;
        let closestDistance = Infinity;
        
        for (let i = 0; i < this.models.length; i++) {
            if (i >= this.modelNames.length) continue;
            
            const model = this.models[i];
            
            let centerX = 0, centerY = 0, centerZ = 0;
            let vertexCount = 0;
            let maxDistanceFromCenter = 0;
            
            for (let j = 0; j < model.vertices.length; j += 3) {
                centerX += model.vertices[j];
                centerY += model.vertices[j+1];
                centerZ += model.vertices[j+2];
                vertexCount++;
            }
            
            if (vertexCount > 0) {
                centerX /= vertexCount;
                centerY /= vertexCount;
                centerZ /= vertexCount;
            }
            
            for (let j = 0; j < model.vertices.length; j += 3) {
                const dx = model.vertices[j] - centerX;
                const dy = model.vertices[j+1] - centerY;
                const dz = model.vertices[j+2] - centerZ;
                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (distance > maxDistanceFromCenter) {
                    maxDistanceFromCenter = distance;
                }
            }
            
            const sphereOrigin = [centerX, centerY, centerZ];
            const sphereRadius = maxDistanceFromCenter;
            
            const dx = rayOrigin[0] - sphereOrigin[0];
            const dz = rayOrigin[2] - sphereOrigin[2];
            const distanceSquared = dx * dx + dz * dz;
            
            if (distanceSquared <= sphereRadius * sphereRadius) {
                const distance = rayOrigin[1] - sphereOrigin[1];
                
                if (distance > 0 && distance < closestDistance) {
                    closestDistance = distance;
                    closestModelIndex = i;
                }
            }
        }
        
        return closestModelIndex;
    }

    selectObject(index) {
        console.log(`Selecting object at index ${index}: ${this.modelNames[index]}`);
        
        if (this.selectedObjectIndex !== -1 && this.selectedObjectIndex < this.models.length) {
            console.log(`Resetting previous selection: ${this.selectedObjectIndex}`);
            
            const originalColorArray = this.originalColors[this.selectedObjectIndex];
            const model = this.models[this.selectedObjectIndex];
            
            model.colors = new Float32Array(originalColorArray);
            
            const gl = this.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.selectedObjectIndex].colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, model.colors, gl.STATIC_DRAW);
        }
        
        this.selectedObjectIndex = index;
        
        const selectedModel = this.models[index];
        const newColors = new Float32Array(selectedModel.colors.length);
        
        for (let i = 0; i < selectedModel.colors.length; i += 3) {
            newColors[i] = this.highlightColor[0];
            newColors[i + 1] = this.highlightColor[1];
            newColors[i + 2] = this.highlightColor[2];
        }
        
        selectedModel.colors = newColors;
        
        const gl = this.renderer.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[index].colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, selectedModel.colors, gl.STATIC_DRAW);
        
        console.log(`Selected model: ${this.modelNames[index]}`);
        
        this.displaySelectionInfo(index);
    }

    displaySelectionInfo(index) {
        const existingInfoDiv = document.getElementById('selection-info');
        if (existingInfoDiv) {
            existingInfoDiv.remove();
        }

        const infoDiv = document.createElement('div');
        infoDiv.id = 'selection-info';
        infoDiv.style.position = 'absolute';
        infoDiv.style.top = '50px';
        infoDiv.style.left = '10px';
        infoDiv.style.color = 'white';
        infoDiv.style.backgroundColor = 'rgba(0,0,0,0.5)';
        infoDiv.style.padding = '10px';
        infoDiv.innerHTML = `
            <strong>Selected Object:</strong> 
            ${this.modelNames[index]}
        `;
        document.body.appendChild(infoDiv);
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
            
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
    }
}

window.onload = async () => {
    const modelFolder = 'models';
    const modelNames = ['cup4.obj', 'random2.obj', 'cube.obj'];
    const app = new RotatingModelApp(modelFolder, modelNames);
    await app.init();
};