class RotatingModelApp {
    constructor(modelFolder, modelNames) {
        this.canvas = document.getElementById('game-surface');
        this.renderer = new Renderer(this.canvas);
        this.program = null;
        this.models = [];
        this.buffers = [];
        this.uniformLocations = {};
        this.modelFolder = modelFolder;
        this.modelNames = modelNames;

        // View mode states
        this.currentViewMode = 'threeD'; // Default to 3D view
        this.viewModes = {
            topView: {
                viewMatrix: new Float32Array(16),
                description: 'Top View (Looking along Z-axis)'
            },
            threeD: {
                viewMatrix: new Float32Array(16),
                description: '3D Perspective View'
            }
        };

        // World and projection matrices
        this.worldMatrix = new Float32Array(16);
        this.projMatrix = new Float32Array(16);

        // Bind methods to ensure correct context
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.init = this.init.bind(this);
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
        const spacing = 1.5; // Spacing between models
        const totalWidth = (modelCount - 1) * spacing;
        const startX = -totalWidth / 2;
        
        return [
            startX + index * spacing, 
            0, 
            0
        ];
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

    async init() {
        try {
            // Ensure required libraries are available
            if (typeof glMatrix === 'undefined') {
                throw new Error('gl-matrix library is not loaded');
            }
            if (typeof OBJ === 'undefined') {
                throw new Error('webgl-obj-loader library is not loaded');
            }

            // Load shader sources
            const vertexShaderSource = await ShaderLoader.fetchShaderSource('shaders/vertex-shader.glsl');
            const fragmentShaderSource = await ShaderLoader.fetchShaderSource('shaders/fragment-shader.glsl');

            // Create shader program
            this.program = await ShaderLoader.loadProgram(
                this.renderer.gl, 
                vertexShaderSource, 
                fragmentShaderSource
            );

            // Validate program
            this.validateProgram();

            // Load models with improved error handling
            for (let i = 0; i < this.modelNames.length; i++) {
                let modelPath = `${this.modelFolder}/${this.modelNames[i]}`;
                let model = await this.loadModelWithDetailing(modelPath);
                
                // Scale the model down
                model = this.scaleModelVertices(model, 0.3);

                // Calculate and apply offset
                const offset = this.calculateModelOffset(i, this.modelNames.length);
                model = this.applyModelOffset(model, offset);

                // Ensure indices are correct
                if (!model.indices || model.indices.length === 0) {
                    console.warn(`Generating indices for model ${this.modelNames[i]}`);
                    model.indices = this.generateIndices(model.vertices.length / 3);
                }

                // Create buffers with additional error checking
                const modelBuffers = this.renderer.createBuffers(model);
                
                // Store model and buffers
                this.models.push(model);
                this.buffers.push(modelBuffers);
            }

            // Setup attributes for each buffer with more robust error handling
            this.buffers.forEach((buffer, index) => {
                try {
                    this.renderer.setupAttributes(this.program, buffer);
                } catch (error) {
                    console.error(`Error setting up attributes for model ${this.modelNames[index]}:`, error);
                }
            });

            // Get and validate uniform locations
            this.getUniformLocations();

            // Setup matrices
            this.setupMatrices();

            // Add key event listener
            window.addEventListener('keydown', this.handleKeyPress);

            // Start animation loop
            this.startAnimationLoop();

            // Display initial view mode
            this.displayViewModeInfo();
        } catch (error) {
            console.error('Initialization error:', error);
            this.displayErrorToUser(error);
        }
    }

    validateProgram() {
        const gl = this.renderer.gl;
        
        // Validate program
        gl.validateProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.VALIDATE_STATUS)) {
            const errorLog = gl.getProgramInfoLog(this.program);
            console.error('Program validation error:', errorLog);
            throw new Error(`Program validation failed: ${errorLog}`);
        }
    }

    displayErrorToUser(error) {
        // Create a user-friendly error display
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.position = 'absolute';
        errorDiv.style.top = '10px';
        errorDiv.style.left = '10px';
        errorDiv.innerHTML = `
            <strong>Error Loading 3D Model:</strong><br>
            ${error.message}
        `;
        document.body.appendChild(errorDiv);
    }

    async loadModelWithDetailing(url) {
        try {
            const model = await OBJLoader.loadModel(url);
            
            // Detailed logging of model properties
            console.group('Model Loading Details');
            console.log('Model:', url);
            console.log('Vertices count:', model.vertices.length / 3);
            console.log('Indices count:', model.indices.length);
            console.log('Colors count:', model.colors.length / 3);
            
            // Validate model data
            if (model.vertices.length === 0) {
                throw new Error('No vertices found in the model');
            }
            if (model.indices.length === 0) {
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
        
        // Get all uniform locations with more robust checking
        this.uniformLocations = {
            mWorld: gl.getUniformLocation(this.program, 'mWorld'),
            mView: gl.getUniformLocation(this.program, 'mView'),
            mProj: gl.getUniformLocation(this.program, 'mProj')
        };

        // Detailed uniform location checking
        Object.entries(this.uniformLocations).forEach(([name, location]) => {
            if (location === null) {
                console.warn(`Uniform ${name} not found in shader. This may cause rendering issues.`);
            }
        });
    }

    handleKeyPress(event) {
        // Switch to Top View when 'T' is pressed
        if (event.key.toLowerCase() === 't') {
            this.currentViewMode = 'topView';
            this.setupViewMatrix();
            this.displayViewModeInfo();
        }
        // Switch to 3D View when 'Y' is pressed
        else if (event.key.toLowerCase() === 'y') {
            this.currentViewMode = 'threeD';
            this.setupViewMatrix();
            this.displayViewModeInfo();
        }
    }

    displayViewModeInfo() {
        // Remove any existing view mode info
        const existingInfoDiv = document.getElementById('view-mode-info');
        if (existingInfoDiv) {
            existingInfoDiv.remove();
        }

        // Create a new info div
        const infoDiv = document.createElement('div');
        infoDiv.id = 'view-mode-info';
        infoDiv.style.position = 'absolute';
        infoDiv.style.top = '10px';
        infoDiv.style.left = '10px';
        infoDiv.style.color = 'white';
        infoDiv.style.backgroundColor = 'rgba(0,0,0,0.5)';
        infoDiv.style.padding = '10px';
        infoDiv.innerHTML = `
            <strong>View Mode:</strong> 
            ${this.currentViewMode === 'threeD' 
                ? '3D Perspective View (Press T for Top View)' 
                : 'Top View (Press Y for 3D View)'
            }
        `;
        document.body.appendChild(infoDiv);
    }

    setupMatrices() {
        const gl = this.renderer.gl;

        // Ensure we use the correct program
        gl.useProgram(this.program);

        // Convert degrees to radians manually
        const degToRad = (deg) => deg * (Math.PI / 180);

        // Setup world matrix
        glMatrix.mat4.identity(this.worldMatrix);

        // Setup projection matrix with adjusted aspect ratio
        glMatrix.mat4.perspective(
            this.projMatrix, 
            degToRad(45), 
            this.canvas.clientWidth / this.canvas.clientHeight, 
            0.1, 
            1000.0
        );

        // Setup view matrices for both modes
        this.setupViewMatrix();

        // Set uniform matrices
        const uniformSetters = [
            { name: 'mWorld', matrix: this.worldMatrix },
            { name: 'mView', matrix: this.viewModes[this.currentViewMode].viewMatrix },
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
            // Clear the canvas
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

            // Ensure we use the correct program
            gl.useProgram(this.program);

            // Remove rotation for static rendering
            glMatrix.mat4.identity(this.worldMatrix);
            
            // Only set uniform if location is valid
            if (this.uniformLocations.mWorld !== null) {
                gl.uniformMatrix4fv(this.uniformLocations.mWorld, gl.FALSE, this.worldMatrix);
            }
            
            // Set the current view matrix
            if (this.uniformLocations.mView !== null) {
                gl.uniformMatrix4fv(
                    this.uniformLocations.mView, 
                    gl.FALSE, 
                    this.viewModes[this.currentViewMode].viewMatrix
                );
            }
            
            // Render each model
            this.models.forEach((model, index) => {
                // Bind the specific buffers before rendering
                const buffers = this.buffers[index];
                this.renderer.setupAttributes(this.program, buffers);
                this.renderer.render(this.program, model);
            });
            
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
    }

    setupViewMatrix() {
        const gl = this.renderer.gl;
        gl.useProgram(this.program);

        // 3D View Matrix - Angled view with wider FOV
        glMatrix.mat4.lookAt(
            this.viewModes.threeD.viewMatrix, 
            [0, 2, 5],    // Adjusted camera position
            [0, 0, 0],    // Look at origin
            [0, 1, 0]     // Up vector
        );

        // Top View Matrix (Looking directly down from top)
        glMatrix.mat4.lookAt(
            this.viewModes.topView.viewMatrix, 
            [0, 5, 0],    // Looking from top
            [0, 0, 0],    // Looking at origin
            [0, 0, -1]    // Adjusted up vector
        );

        // Update view matrix in the rendering pipeline
        const viewLocation = this.uniformLocations.mView;
        if (viewLocation !== null) {
            gl.uniformMatrix4fv(
                viewLocation, 
                gl.FALSE, 
                this.viewModes[this.currentViewMode].viewMatrix
            );
        }
    }
}

// Initialize the application when the window loads
window.onload = async () => {
    const modelFolder = 'models';
    const modelNames = ['cube.obj', 'arrow1.obj', 'cube.obj'];
    const app = new RotatingModelApp(modelFolder, modelNames);
    await app.init();
};