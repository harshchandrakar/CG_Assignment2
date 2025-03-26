class RotatingModelApp {
    constructor() {
        this.canvas = document.getElementById('game-surface');
        this.renderer = new Renderer(this.canvas);
        this.program = null;
        this.model = null;
        this.buffers = null;
        this.uniformLocations = {};

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

        // Bind key event handler - move this to the end of methods to ensure all methods exist
        this.handleKeyPress = this.handleKeyPress.bind(this);
    }
    scaleModelVertices(model, scale = 0.5) {
        const scaledVertices = new Float32Array(model.vertices.length);
        for (let i = 0; i < model.vertices.length; i++) {
            scaledVertices[i] = model.vertices[i] * scale;
        }
        model.vertices = scaledVertices;
        return model;
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

            // Load model with enhanced error handling
            let model = await this.loadModelWithDetailing('models/cube.obj');
            
            // Scale the model down
            model = this.scaleModelVertices(model, 0.3);

            // Create buffers
            this.buffers = this.renderer.createBuffers(model);

            // Store the model
            this.model = model;

            // Setup attributes
            this.renderer.setupAttributes(this.program, this.buffers);

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

    // Restored methods from previous implementation
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
            console.log('Vertices count:', model.vertices.length / 3);
            console.log('Indices count:', model.indices.length);
            console.log('Colors count:', model.colors.length / 3);
            
            // Validate model data
            if (model.vertices.length === 0) {
                throw new Error('No vertices found in the model');
            }
            if (model.indices.length === 0) {
                throw new Error('No indices found in the model');
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

    // Handle key press for view mode switching
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

    // Display current view mode information
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

        // Create matrices
        const worldMatrix = new Float32Array(16);
        const projMatrix = new Float32Array(16);

        // Convert degrees to radians manually
        const degToRad = (deg) => deg * (Math.PI / 180);

        // Setup world matrix
        glMatrix.mat4.identity(worldMatrix);

        // Setup projection matrix with slightly adjusted aspect ratio handling
        glMatrix.mat4.perspective(
            projMatrix, 
            degToRad(45), 
            this.canvas.clientWidth / this.canvas.clientHeight, 
            0.1, 
            1000.0
        );

        // Setup view matrices for both modes
        this.setupViewMatrix();

        // Store matrices as class properties
        this.worldMatrix = worldMatrix;
        this.projMatrix = projMatrix;

        // Set uniform matrices
        const uniformSetters = [
            { name: 'mWorld', matrix: worldMatrix },
            { name: 'mView', matrix: this.viewModes[this.currentViewMode].viewMatrix },
            { name: 'mProj', matrix: projMatrix }
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

    // Setup view matrices for different modes
    setupViewMatrix() {
        // 3D View Matrix - Angled view from top-right
        glMatrix.mat4.lookAt(
            this.viewModes.threeD.viewMatrix, 
            [3, 3, -5],   // Reduced camera distance
            [0, 0, 0],    // Look at origin
            [0, 1, 0]     // Up vector
        );

        // Top View Matrix (Looking directly down Z-axis)
        glMatrix.mat4.lookAt(
            this.viewModes.topView.viewMatrix, 
            [0, 5, 0],    // Reduced height
            [0, 0, 0],    // Looking at origin
            [1, 0, 0]     // Rotated up vector to change orientation
        );

        // Update view matrix in the rendering pipeline
        const gl = this.renderer.gl;
        gl.useProgram(this.program);
        const viewLocation = this.uniformLocations.mView;
        if (viewLocation !== null) {
            gl.uniformMatrix4fv(
                viewLocation, 
                gl.FALSE, 
                this.viewModes[this.currentViewMode].viewMatrix
            );
        }
    }
    startAnimationLoop() {
        const gl = this.renderer.gl;

        const identityMatrix = new Float32Array(16);
        glMatrix.mat4.identity(identityMatrix);

        const loop = () => {
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
            
            this.renderer.render(this.program, this.model);
            
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
    }
}

// Initialize the application when the window loads
window.onload = async () => {
    const app = new RotatingModelApp();
    await app.init();
};