function checkWebGLContext(canvas) {
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
        throw new Error('WebGL not supported. Please use a browser that supports WebGL.');
    }
    
    // Check for context loss
    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.error('WebGL context lost!');
        alert('WebGL context lost. Please reload the page.');
    });
    
    // Check for context restoration
    canvas.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored!');
        location.reload(); // Reload to restore the application
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
        // Set explicit canvas dimensions
        this.canvas.width = window.innerWidth * 0.8;  
        this.canvas.height = window.innerHeight * 0.8;
        this.canvas.style.width = `${this.canvas.width}px`;
        this.canvas.style.height = `${this.canvas.height}px`;
        
        // Initialize WebGL with error handling
        try {
            const gl = checkWebGLContext(this.canvas);
            this.renderer = new Renderer(this.canvas);
            
            // Set a dark background color to confirm rendering works
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
        
        // Object selection state variables
        this.selectedObjectIndex = -1;  // -1 means no selection
        this.originalColors = [];      // Store original colors for reset
        this.highlightColor = [1.0, 0.5, 0.0];  // Bright orange highlight color

        // Create the view manager
        this.viewManager = new ViewManager(this);

        // Bind methods to ensure correct context
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

    // Modified to not apply any offset - all models will be at origin
    calculateModelOffset(index, modelCount) {
        return [0, 0, 0]; // No offset - all at origin
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

    // Generate unique colors for each model to make them visually distinguishable
    generateUniqueColors(model, index) {
        // Generate a unique color based on the model index
        // Using a color palette for better distinction
        const colorPalette = [
            [0.8, 0.2, 0.2], // Red
            [0.2, 0.8, 0.2], // Green
            [0.2, 0.2, 0.8], // Blue
            [0.8, 0.8, 0.2], // Yellow
            [0.8, 0.2, 0.8], // Magenta
            [0.2, 0.8, 0.8]  // Cyan
        ];
        
        const modelColor = colorPalette[index % colorPalette.length];
        const colors = new Float32Array(model.vertices.length);
        
        // Assign the color to all vertices
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
            
            // Check if we have a valid WebGL context
            if (!this.renderer || !this.renderer.gl) {
                throw new Error('WebGL renderer not properly initialized');
            }
            
            const gl = this.renderer.gl;
            
            // Ensure required libraries are available
            if (typeof glMatrix === 'undefined') {
                throw new Error('gl-matrix library is not loaded');
            }
            if (typeof OBJ === 'undefined') {
                throw new Error('webgl-obj-loader library is not loaded');
            }

            // Load shader sources with error handling
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

            // Create shader program with error handling
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

            // Validate program
            try {
                this.validateProgram();
                console.log("Shader program validated");
            } catch (error) {
                throw new Error(`Program validation failed: ${error.message}`);
            }

            
            // Load models with progress logging
            console.log(`Loading ${this.modelNames.length} models...`);
            for (let i = 0; i < this.modelNames.length; i++) {
                console.log(`Loading model ${i+1}/${this.modelNames.length}: ${this.modelNames[i]}`);
                let modelPath = `${this.modelFolder}/${this.modelNames[i]}`;
                
                try {
                    let model = await this.loadModelWithDetailing(modelPath);
                    
                    // Scale the model down
                    model = this.scaleModelVertices(model, 0.3);
                    
                    // Generate unique colors for each model
                    model.colors = this.generateUniqueColors(model, i);

                    // Ensure indices are correct
                    if (!model.indices || model.indices.length === 0) {
                        console.warn(`Generating indices for model ${this.modelNames[i]}`);
                        model.indices = this.generateIndices(model.vertices.length / 3);
                    }

                    const modelCenter = this.calculateModelCenter(model);
                    this.modelCenters.push(modelCenter);
                    console.log(`Model ${this.modelNames[i]} center: (${modelCenter.x.toFixed(2)}, ${modelCenter.y.toFixed(2)}, ${modelCenter.z.toFixed(2)})`);


                    // Create buffers with additional error checking
                    const modelBuffers = this.renderer.createBuffers(model);
                    
                    // Store model and buffers
                    this.models.push(model);
                    this.buffers.push(modelBuffers);
                    this.modelBuffers.push(modelBuffers);
                    
                    // Store original colors for later reset (deep copy)
                    this.originalColors.push(new Float32Array(model.colors));
                    
                    console.log(`Model ${this.modelNames[i]} loaded successfully`);
                } catch (error) {
                    console.error(`Failed to load model ${this.modelNames[i]}:`, error);
                    throw new Error(`Failed to load model ${this.modelNames[i]}: ${error.message}`);
                }
            }

            // Initialize view manager
            try {
                await this.viewManager.init(this.program);
                console.log("View manager initialized");
            } catch (error) {
                throw new Error(`View manager initialization failed: ${error.message}`);
            }
            
            // Initialize movement controller
            try {
                await this.movementController.init();
                console.log("Movement controller initialized");
            } catch (error) {
                throw new Error(`Movement controller initialization failed: ${error.message}`);
            }
            
            // Add all axis buffers to our main buffers array
            this.buffers = [...this.modelBuffers, ...this.viewManager.axesBuffers];

            // Setup attributes for each buffer with more robust error handling
            this.buffers.forEach((buffer, index) => {
                try {
                    this.renderer.setupAttributes(this.program, buffer);
                } catch (error) {
                    console.error(`Error setting up attributes for buffer ${index}:`, error);
                }
            });

            // Get and validate uniform locations
            try {
                this.getUniformLocations();
                console.log("Uniform locations obtained");
            } catch (error) {
                throw new Error(`Failed to get uniform locations: ${error.message}`);
            }

            // Setup matrices
            try {
                this.setupMatrices();
                console.log("Matrices set up");
            } catch (error) {
                throw new Error(`Failed to set up matrices: ${error.message}`);
            }

            // Add event listeners
            window.addEventListener('keydown', this.handleKeyPress);
            this.canvas.addEventListener('click', this.handleMouseClick);

            // Start animation loop
            console.log("Starting animation loop");
            this.startAnimationLoop();

            // Display initial view mode
            this.viewManager.displayViewModeInfo();
            
            console.log("App initialization completed successfully");
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
        console.error('Error:', error);
        
        // Create a visible error display
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
            
            // Detailed logging of model properties
            console.group('Model Loading Details');
            console.log('Model:', url);
            console.log('Vertices count:', model.vertices.length / 3);
            console.log('Indices count:', model.indices ? model.indices.length : 0);
            
            // Validate model data
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
        // Pass key press events to the view manager
        this.viewManager.handleKeyPress(event);
    }

    handleMouseClick(event) {
        // Only process clicks in Top View mode
        if (this.viewManager.currentViewMode !== 'topView') {
            console.log('Object picking is only available in Top View mode.');
            return;
        }
    
        // Get canvas relative coordinates
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        // Convert to normalized device coordinates (-1 to 1)
        const ndcX = (x / this.canvas.width) * 2 - 1;
        const ndcY = -((y / this.canvas.height) * 2 - 1); // Flip Y
        
        console.log(`Click at NDC coordinates: (${ndcX.toFixed(2)}, ${ndcY.toFixed(2)})`);
        
        // Cast ray from camera position in Top View
        const modelIndex = this.pickObject(ndcX, ndcY);
        
        console.log(`Picked model index: ${modelIndex}`);
        
        // If an object was picked, highlight it
        if (modelIndex !== -1 && modelIndex < this.models.length) {
            this.selectObject(modelIndex);
        } else {
            // Clear selection when clicking on empty space
            if (this.selectedObjectIndex !== -1) {
                this.resetSelection();
            }
        }
    }
    
    // Add this helper method to reset selection
    resetSelection() {
        if (this.selectedObjectIndex !== -1 && this.selectedObjectIndex < this.models.length) {
            console.log(`Resetting selection: ${this.selectedObjectIndex}`);
            
            // Restore original colors
            const originalColorArray = this.originalColors[this.selectedObjectIndex];
            const model = this.models[this.selectedObjectIndex];
            
            // Perform deep copy
            model.colors = new Float32Array(originalColorArray);
            
            // Update color buffer
            const gl = this.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.selectedObjectIndex].colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, model.colors, gl.STATIC_DRAW);
            
            // Remove selection info from display
            const infoDiv = document.getElementById('selection-info');
            if (infoDiv) {
                infoDiv.remove();
            }
            
            // Reset selection index
            this.selectedObjectIndex = -1;
        }
    }

    pickObject(ndcX, ndcY) {
        // Use ray-casting from top view to determine which object was clicked
        
        // In top view, our ray starts directly above the scene and points down
        const rayOrigin = [ndcX * 5, 5, ndcY * 5]; // Start position based on click position
        const rayDirection = [0, -1, 0]; // Pointing straight down in top view
        
        // Perform simple ray-model intersection tests
        let closestModelIndex = -1;
        let closestDistance = Infinity;
        
        for (let i = 0; i < this.models.length; i++) {
            // Skip non-model objects (like axes)
            if (i >= this.modelNames.length) continue;
            
            const model = this.models[i];
            
            // Calculate model's center position and bounding sphere
            let centerX = 0, centerY = 0, centerZ = 0;
            let vertexCount = 0;
            let maxDistanceFromCenter = 0;
            
            // First pass: calculate center position
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
            
            // Second pass: calculate radius
            for (let j = 0; j < model.vertices.length; j += 3) {
                const dx = model.vertices[j] - centerX;
                const dy = model.vertices[j+1] - centerY;
                const dz = model.vertices[j+2] - centerZ;
                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (distance > maxDistanceFromCenter) {
                    maxDistanceFromCenter = distance;
                }
            }
            
            // Simple sphere-ray intersection
            const sphereOrigin = [centerX, centerY, centerZ]; // Use calculated center
            const sphereRadius = maxDistanceFromCenter;
            
            // Ray-sphere intersection test
            const dx = rayOrigin[0] - sphereOrigin[0];
            const dz = rayOrigin[2] - sphereOrigin[2];
            const distanceSquared = dx * dx + dz * dz;
            
            // If the distance in XZ plane is less than sphere radius, we have a hit
            if (distanceSquared <= sphereRadius * sphereRadius) {
                // The y distance is what matters for determining which object is on top
                const distance = rayOrigin[1] - sphereOrigin[1];
                
                // Keep closest valid intersection (closer to camera)
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
        
        // Reset previous selection if there was one
        if (this.selectedObjectIndex !== -1 && this.selectedObjectIndex < this.models.length) {
            console.log(`Resetting previous selection: ${this.selectedObjectIndex}`);
            
            // Restore original colors
            const originalColorArray = this.originalColors[this.selectedObjectIndex];
            const model = this.models[this.selectedObjectIndex];
            
            // Perform deep copy
            model.colors = new Float32Array(originalColorArray);
            
            // Update color buffer
            const gl = this.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[this.selectedObjectIndex].colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, model.colors, gl.STATIC_DRAW);
        }
        
        // Set new selection
        this.selectedObjectIndex = index;
        
        // Apply highlight color to selected object
        const selectedModel = this.models[index];
        const newColors = new Float32Array(selectedModel.colors.length);
        
        for (let i = 0; i < selectedModel.colors.length; i += 3) {
            newColors[i] = this.highlightColor[0];     // Red
            newColors[i + 1] = this.highlightColor[1]; // Green
            newColors[i + 2] = this.highlightColor[2]; // Blue
        }
        
        // Update model colors
        selectedModel.colors = newColors;
        
        // Update color buffer in WebGL
        const gl = this.renderer.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[index].colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, selectedModel.colors, gl.STATIC_DRAW);
        
        console.log(`Selected model: ${this.modelNames[index]}`);
        
        // Display selection info
        this.displaySelectionInfo(index);
    }

    displaySelectionInfo(index) {
        // Remove any existing selection info
        const existingInfoDiv = document.getElementById('selection-info');
        if (existingInfoDiv) {
            existingInfoDiv.remove();
        }

        // Create a new info div
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

        // Ensure we use the correct program
        gl.useProgram(this.program);

        // Setup world matrix
        glMatrix.mat4.identity(this.worldMatrix);

        // Set up view matrix
        this.viewManager.setupViewMatrix();

        // Setup projection matrix with adjusted aspect ratio
        const degToRad = (deg) => deg * (Math.PI / 180);
        glMatrix.mat4.perspective(
            this.projMatrix, 
            degToRad(45), 
            this.canvas.clientWidth / this.canvas.clientHeight, 
            0.1, 
            1000.0
        );

        // Set uniform matrices
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
            // Clear the canvas
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            
            // Ensure we use the correct program
            gl.useProgram(this.program);

            // Initialize the world matrix for each frame
            this.worldMatrix = new Float32Array(16);
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
                    this.viewManager.viewModes[this.viewManager.currentViewMode].viewMatrix
                );
            }
            
            // First render all models with depth testing enabled
            gl.enable(gl.DEPTH_TEST);
            this.models.forEach((model, index) => {
                // Skip the axes models for now
                if (index >= this.modelNames.length) return;
                
                // Bind the specific buffers before rendering
                const buffers = this.buffers[index];
                this.renderer.setupAttributes(this.program, buffers);
                this.renderer.render(this.program, model);
            });
            
            // Now render axes with depth test disabled so they're always visible
            gl.disable(gl.DEPTH_TEST);
            this.viewManager.axesModels.forEach((axisModel, index) => {
                this.renderer.setupAttributes(this.program, this.viewManager.axesBuffers[index]);
                this.renderer.render(this.program, axisModel);
            });
            
            // Re-enable depth test for next frame
            gl.enable(gl.DEPTH_TEST);
            
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
    }
}

// Initialize the application when the window loads
window.onload = async () => {
    const modelFolder = 'models';
    const modelNames = ['cup4.obj', 'random2.obj', 'cube.obj'];
    const app = new RotatingModelApp(modelFolder, modelNames);
    await app.init();
};