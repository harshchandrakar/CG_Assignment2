class ViewManager {
    constructor(app) {
        this.app = app;
        this.axesModels = [];
        this.axesBuffers = [];
        
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

        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;
        this.cameraRadius = Math.sqrt(3*3 + 3*3 + 5*5); // Original camera distance
        this.cameraTheta = Math.atan2(5, 3); // Initial angles
        this.cameraPhi = Math.asin(3/this.cameraRadius);
        this.initCameraPosition(); 
        
        // Event listeners
        app.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        app.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        app.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.createLabelCanvas(); 
            
        // Bind methods to preserve context
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.setupViewMatrix = this.setupViewMatrix.bind(this);
        this.displayViewModeInfo = this.displayViewModeInfo.bind(this);
    }

    async init(program) {
        this.program = program;
        
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
            const axisBuffers = this.app.renderer.createBuffers(axisModel);
            
            this.axesModels.push(axisModel);
            this.axesBuffers.push(axisBuffers);
        }
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
    createLabelCanvas() {
        const existingCanvas = document.getElementById('axis-label-canvas');
        if (existingCanvas) existingCanvas.remove();

        this.labelCanvas = document.createElement('canvas');
        this.labelCanvas.id = 'axis-label-canvas';
        const glCanvas = this.app.canvas;
        const rect = glCanvas.getBoundingClientRect();

        Object.assign(this.labelCanvas.style, {
            position: 'absolute',
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${glCanvas.width}px`,
            height: `${glCanvas.height}px`,
            pointerEvents: 'none',
            backgroundColor: 'transparent', // Add this line
            zIndex: '99'
        });

        this.labelCanvas.width = glCanvas.width;
        this.labelCanvas.height = glCanvas.height;
        document.body.appendChild(this.labelCanvas);
        this.labelContext = this.labelCanvas.getContext('2d');
    }

    worldToScreenCoordinates(worldX, worldY, worldZ) {
        const viewMatrix = this.viewModes[this.currentViewMode].viewMatrix;
        const projMatrix = this.app.projMatrix;

        const worldPoint = glMatrix.vec4.fromValues(worldX, worldY, worldZ, 1.0);
        const viewPoint = glMatrix.vec4.create();
        glMatrix.vec4.transformMat4(viewPoint, worldPoint, viewMatrix);
        const clipPoint = glMatrix.vec4.create();
        glMatrix.vec4.transformMat4(clipPoint, viewPoint, projMatrix);

        if (clipPoint[3] === 0) return null;

        const ndcX = clipPoint[0] / clipPoint[3];
        const ndcY = clipPoint[1] / clipPoint[3];

        const screenX = ((ndcX + 1) / 2) * this.app.canvas.width;
        const screenY = ((1 - ndcY) / 2) * this.app.canvas.height;

        return { x: screenX, y: screenY };
    }

    drawAxisLabels() {
        this.labelContext.clearRect(0, 0, this.labelCanvas.width, this.labelCanvas.height);

        const tipPositions = [
            [0.6, 0, 0], // X-axis tip
            [0, 0.6, 0], // Y-axis tip
            [0, 0, 0.6]  // Z-axis tip
        ];
        const colors = ['#ff0000', '#00ff00', '#0000ff'];
        const labels = ['X', 'Y', 'Z'];

        tipPositions.forEach((pos, idx) => {
            const screenCoords = this.worldToScreenCoordinates(...pos);
            if (screenCoords) {
                this.labelContext.fillStyle = colors[idx];
                this.labelContext.font = '14px Arial';
                this.labelContext.fillText(labels[idx], screenCoords.x + 5, screenCoords.y + 5);
            }
        });
    }

    initCameraPosition() {
        this.cameraRadius = 8; // Increased initial distance
        this.cameraTheta = Math.PI/4; // 45 degrees
        this.cameraPhi = Math.PI/6; // 30 degrees
        this.update3DViewMatrix();
    }

    handleMouseDown(event) {
        if (this.currentViewMode === 'threeD') {
            this.isDragging = true;
            this.lastX = event.clientX;
            this.lastY = event.clientY;
        }
    }
    
    handleMouseMove(event) {
        if (!this.isDragging || this.currentViewMode !== 'threeD') return;
        
        const dx = event.clientX - this.lastX;
        const dy = event.clientY - this.lastY;
        this.lastX = event.clientX;
        this.lastY = event.clientY;

        // Axis-aligned rotation
        if(Math.abs(dx) > Math.abs(dy)) {
            // Y-axis rotation
            this.cameraTheta += dx * 0.01;
        } else {
            // X-axis rotation
            this.cameraPhi -= dy * 0.01;
            this.cameraPhi = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.cameraPhi));
        }

        this.update3DViewMatrix();
    }
    
    handleMouseUp() {
        this.isDragging = false;
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
            this.initCameraPosition();
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
            ? '3D Perspective View (Drag mouse to rotate, Press T for Top View)' 
            : 'Top View (Press Y for 3D View, Click to Select Objects)'
        }
    `;
        document.body.appendChild(infoDiv);
    }

    setupViewMatrix() {
        const gl = this.app.renderer.gl;
        gl.useProgram(this.program);
    
        // Keep top view setup
        glMatrix.mat4.lookAt(
            this.viewModes.topView.viewMatrix, 
            [0, 5, 0],
            [0, 0, 0],
            [0, 0, -1]
        );
    
        // Update view matrix
        const viewLocation = this.app.uniformLocations.mView;
        if (viewLocation !== null) {
            gl.uniformMatrix4fv(
                viewLocation, 
                gl.FALSE, 
                this.viewModes[this.currentViewMode].viewMatrix
            );
        }
    }
    update3DViewMatrix() {
        const x = this.cameraRadius * Math.cos(this.cameraTheta) * Math.cos(this.cameraPhi);
        const y = this.cameraRadius * Math.sin(this.cameraPhi);
        const z = this.cameraRadius * Math.sin(this.cameraTheta) * Math.cos(this.cameraPhi);
        
        glMatrix.mat4.lookAt(
            this.viewModes.threeD.viewMatrix,
            [x, y, z],
            [0, 0, 0],
            [0, 1, 0]
        );
        
        if (this.currentViewMode === 'threeD') {
            this.setupViewMatrix();
        }
    }
}