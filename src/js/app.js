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
        this.axesModels = [];
        this.modelBuffers = [];
        this.axesBuffers = [];
        
        // Object selection state variables
        this.selectedObjectIndex = -1;  // -1 means no selection
        this.originalColors = [];      // Store original colors for reset
        this.highlightColor = [1.0, 0.5, 0.0];  // Bright orange highlight color

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
        this.handleMouseClick = this.handleMouseClick.bind(this);
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

    async generateAxisArrow(color, rotation, length = 1.0) {
        // Create vertices for a simple axis representation
        const cylinderVertices = [];
        const coneVertices = [];
        const colors = [];

        // Cylinder parameters - increased size for better visibility
        const cylinderRadius = 0.05; // Increased from 0.03
        const cylinderHeight = length * 0.8; // Increased from 0.6
        const coneHeight = length * 0.4; // Increased from 0.2
        const segments = 12;

        // Generate cylinder vertices
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            const x = cylinderRadius * Math.cos(theta);
            const y = cylinderRadius * Math.sin(theta);

            // Bottom and top of cylinder
            cylinderVertices.push(x, y, 0);
            cylinderVertices.push(x, y, cylinderHeight);
        }

        // Generate cone vertices
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            const x = cylinderRadius * 2 * Math.cos(theta); // Larger cone base
            const y = cylinderRadius * 2 * Math.sin(theta);

            // Base of cone
            coneVertices.push(x, y, cylinderHeight);
            // Tip of cone
            coneVertices.push(0, 0, cylinderHeight + coneHeight);
        }

        // Create indices for cylinder and cone
        const cylinderIndices = [];
        const coneIndices = [];

        // Cylinder side faces
        for (let i = 0; i < segments; i++) {
            cylinderIndices.push(
                i * 2, i * 2 + 1, 
                (i + 1) * 2, 
                (i + 1) * 2, 
                i * 2 + 1, 
                (i + 1) * 2 + 1
            );
        }

        // Cone side faces
        for (let i = 0; i < segments; i++) {
            coneIndices.push(
                i * 2, 
                (i + 1) * 2, 
                i * 2 + 1
            );
        }

        // Combine cylinder and cone vertices
        const vertices = new Float32Array([...cylinderVertices, ...coneVertices]);

        // Create colors for the entire geometry
        for (let i = 0; i < (cylinderVertices.length / 3) + (coneVertices.length / 3); i++) {
            colors.push(color[0], color[1], color[2]);
        }

        // Create the model object
        const model = {
            vertices: vertices,
            colors: new Float32Array(colors),
            indices: new Uint16Array([...cylinderIndices, ...coneIndices.map(i => i + cylinderVertices.length / 3)])
        };

        // Rotate the model to align with the correct axis
        const rotatedVertices = new Float32Array(model.vertices.length);
        for (let i = 0; i < model.vertices.length; i += 3) {
            let x = model.vertices[i];
            let y = model.vertices[i + 1];
            let z = model.vertices[i + 2];
            
            // Apply rotation based on the specified axis
            if (rotation === 'x') {
                rotatedVertices[i] = z;
                rotatedVertices[i + 1] = x;
                rotatedVertices[i + 2] = y;
            } else if (rotation === 'y') {
                rotatedVertices[i] = x;
                rotatedVertices[i + 1] = z;
                rotatedVertices[i + 2] = y;
            } else { // z-axis (default)
                rotatedVertices[i] = x;
                rotatedVertices[i + 1] = y;
                rotatedVertices[i + 2] = z;
            }
        }
        model.vertices = rotatedVertices;

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

            // First load all model objects at the origin
            for (let i = 0; i < this.modelNames.length; i++) {
                let modelPath = `${this.modelFolder}/${this.modelNames[i]}`;
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

                // Create buffers with additional error checking
                const modelBuffers = this.renderer.createBuffers(model);
                
                // Store model and buffers
                this.models.push(model);
                this.buffers.push(modelBuffers);
                this.modelBuffers.push(modelBuffers);
                
                // Store original colors for later reset (deep copy)
                this.originalColors.push(new Float32Array(model.colors));
            }

            // Generate and load axis arrows
            const axisColors = [
                [1.0, 0.0, 0.0],  // X-axis (Red)
                [0.0, 1.0, 0.0],  // Y-axis (Green)
                [0.0, 0.0, 1.0]   // Z-axis (Blue)
            ];
            const axisRotations = ['x', 'y', 'z'];
            const axisLengths = [0.5, 0.5, 0.5]; // Make them longer for better visibility

            // Create axis arrows
            for (let i = 0; i < 3; i++) {
                const axisModel = await this.generateAxisArrow(axisColors[i], axisRotations[i], axisLengths[i]);
                const axisBuffers = this.renderer.createBuffers(axisModel);
                
                this.axesModels.push(axisModel);
                this.axesBuffers.push(axisBuffers);
            }

            // Setup attributes for each buffer with more robust error handling
            this.buffers.forEach((buffer, index) => {
                try {
                    this.renderer.setupAttributes(this.program, buffer);
                } catch (error) {
                    console.error(`Error setting up attributes for buffer ${index}:`, error);
                }
            });

            // Get and validate uniform locations
            this.getUniformLocations();

            // Setup matrices
            this.setupMatrices();

            // Add event listeners
            window.addEventListener('keydown', this.handleKeyPress);
            this.canvas.addEventListener('click', this.handleMouseClick);

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

    handleMouseClick(event) {
        // Only process clicks in Top View mode
        if (this.currentViewMode !== 'topView') {
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
        
        console.log(`Ray origin: (${rayOrigin[0].toFixed(2)}, ${rayOrigin[1].toFixed(2)}, ${rayOrigin[2].toFixed(2)})`);
        console.log(`Ray direction: (${rayDirection[0].toFixed(2)}, ${rayDirection[1].toFixed(2)}, ${rayDirection[2].toFixed(2)})`);
        
        // Perform simple ray-model intersection tests
        let closestModelIndex = -1;
        let closestDistance = Infinity;
        
        for (let i = 0; i < this.models.length; i++) {
            // Skip non-model objects (like axes)
            if (i >= this.modelNames.length) continue;
            
            const model = this.models[i];
            
            // Calculate model's bounding sphere
            let maxDistance = 0;
            for (let j = 0; j < model.vertices.length; j += 3) {
                const distance = Math.sqrt(
                    model.vertices[j] * model.vertices[j] + 
                    model.vertices[j+1] * model.vertices[j+1] + 
                    model.vertices[j+2] * model.vertices[j+2]
                );
                if (distance > maxDistance) {
                    maxDistance = distance;
                }
            }
            
            console.log(`Model ${i} bounding sphere radius: ${maxDistance.toFixed(4)}`);
            
            // Simple sphere-ray intersection
            const sphereOrigin = [0, 0, 0]; // All models are at origin
            const sphereRadius = maxDistance;
            
            // Ray-sphere intersection test
            // For straight down ray, we just need to check if the XZ coordinates are within the sphere radius
            const dx = rayOrigin[0] - sphereOrigin[0];
            const dz = rayOrigin[2] - sphereOrigin[2];
            const distanceSquared = dx * dx + dz * dz;
            
            // If the distance in XZ plane is less than sphere radius, we have a hit
            if (distanceSquared <= sphereRadius * sphereRadius) {
                // The y distance is what matters for determining which object is on top
                const distance = rayOrigin[1] - sphereOrigin[1];
                
                console.log(`Model ${i} intersection distance: ${distance.toFixed(4)}`);
                
                // Keep closest valid intersection (closer to camera)
                if (distance > 0 && distance < closestDistance) {
                    closestDistance = distance;
                    closestModelIndex = i;
                }
            } else {
                console.log(`No intersection with model ${i}`);
            }
        }
        
        console.log(`Selected model index: ${closestModelIndex}, distance: ${closestDistance.toFixed(4)}`);
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
                : 'Top View (Press Y for 3D View, Click to Select Objects)'
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

            // Initialize the world matrix for each frame
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
            this.axesModels.forEach((axisModel, index) => {
                this.renderer.setupAttributes(this.program, this.axesBuffers[index]);
                this.renderer.render(this.program, axisModel);
            });
            
            // Re-enable depth test for next frame
            gl.enable(gl.DEPTH_TEST);
            
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
            [3, 3, 5],    // Adjusted camera position for better viewing of models at origin
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
    const modelNames = ['cup4.obj', 'random2.obj', 'cube.obj'];
    const app = new RotatingModelApp(modelFolder, modelNames);
    await app.init();
};