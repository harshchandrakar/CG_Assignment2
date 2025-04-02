class ObjectMovementController {
    constructor(app) {
        this.app = app;
        this.pathPoints = []; 
        this.isDefiningPath = false; 
        this.curvePoints = []; 
        this.animationStartTime = null; 
        this.animationDuration = 5000; 
        this.isAnimating = false; 
        this.animationProgress = 0; 
        this.originalModelPosition = null; 
        this.zHeight = 0.5; 
        this.viewSize = 4; 
        
        // Bind methods
        this.handleMouseClick = this.handleMouseClick.bind(this);
        this.startPathDefinition = this.startPathDefinition.bind(this);
        this.calculateQuadraticCurve = this.calculateQuadraticCurve.bind(this);
        this.animateAlongPath = this.animateAlongPath.bind(this);
        this.resetPath = this.resetPath.bind(this);
        this.displayPathPointInfo = this.displayPathPointInfo.bind(this);
        this.displayPathVisualization = this.displayPathVisualization.bind(this);
        this.screenToWorldCoordinates = this.screenToWorldCoordinates.bind(this);
        this.worldToScreenCoordinates = this.worldToScreenCoordinates.bind(this);
    }

    init() {
        this.addMovementControlUI();
        
        // Create path visualization canvas (overlay)
        this.createPathCanvas();
        
        // Listen for keyboard shortcuts
        window.addEventListener('keydown', (event) => {
            // 'M' key to start movement path definition
            if (event.key.toLowerCase() === 'm') {
                this.startPathDefinition();
            }
            // 'R' key to reset path
            else if (event.key.toLowerCase() === 'r') {
                this.resetPath();
            }
        });
    }

    createPathCanvas() {
        // Remove any existing path canvas
        const existingCanvas = document.getElementById('path-canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }
    
        const pathCanvas = document.createElement('canvas');
        pathCanvas.id = 'path-canvas';
        
        // Get WebGL canvas position and dimensions
        const glCanvas = this.app.canvas;
        const glRect = glCanvas.getBoundingClientRect();
        
        Object.assign(pathCanvas.style, {
            position: 'absolute',
            top: `${glRect.top}px`,
            left: `${glRect.left}px`,
            width: `${glRect.width}px`,
            height: `${glRect.height}px`,
            pointerEvents: 'none',
            backgroundColor: 'transparent',
            zIndex: '100' // High enough to be above the WebGL canvas
        });
        
        // Set the actual canvas dimensions to match WebGL canvas
        pathCanvas.width = glCanvas.width;
        pathCanvas.height = glCanvas.height;
        
        document.body.appendChild(pathCanvas);
        
        this.pathCanvas = pathCanvas;
        this.pathContext = pathCanvas.getContext('2d');
        
        console.log(`Path canvas created with dimensions: ${pathCanvas.width}x${pathCanvas.height}`);
    }

    addMovementControlUI() {
        const controlPanel = document.createElement('div');
        controlPanel.id = 'movement-controls';
        Object.assign(controlPanel.style, {
            position: 'absolute',
            top: '100px',
            left: '10px',
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            zIndex: '1000', // Ensure it's above other elements
            fontFamily: 'Arial, sans-serif',
            width: '250px'
        });
    
        controlPanel.innerHTML = `
            <h3 style="margin-top: 0; text-align: center;">Movement Controls</h3>
            <button id="start-path-btn" style="width: 100%; padding: 8px; margin-bottom: 8px; cursor: pointer;">Define Movement Path (M)</button>
            <button id="reset-path-btn" style="width: 100%; padding: 8px; margin-bottom: 8px; cursor: pointer;">Reset Path (R)</button>
            <div id="path-info" style="margin-top: 10px; border-top: 1px solid #aaa; padding-top: 10px;"></div>
        `;
    
        document.body.appendChild(controlPanel);
    
        // Add event listeners to buttons
        document.getElementById('start-path-btn').addEventListener('click', this.startPathDefinition);
        document.getElementById('reset-path-btn').addEventListener('click', this.resetPath);
    }    

    startPathDefinition() {
        console.log("Starting path definition...");
        
        // Check if we're in Top View mode
        if (this.app.viewManager.currentViewMode !== 'topView') {
            alert('Please switch to Top View (press T) before defining a movement path.');
            return;
        }
    
        // Check if an object is selected
        if (this.app.selectedObjectIndex === -1) {
            alert('Please select an object first before defining a movement path.');
            return;
        }
    
        // Reset any existing path
        this.resetPath();
    
        // Start path definition
        this.isDefiningPath = true;
        console.log("Path definition started, pathPoints reset");
        
        // Store the selected object's current position as p0
        this.pathPoints.push({
            x: 0, // All models are at origin in this app
            y: 0,
            z: 0
        });
        
        console.log("Added initial point:", this.pathPoints[0]);
        
        // Update UI
        this.updatePathInfoUI('Click to define point P1 (first control point)');
        
        // Add temporary click handler
        this.originalClickHandler = this.app.handleMouseClick;
        this.app.canvas.removeEventListener('click', this.app.handleMouseClick);
        this.app.canvas.addEventListener('click', this.handleMouseClick);
        
        console.log("Click handler for path definition registered");
    }

    handleMouseClick(event) {
        // Only process clicks if we're defining a path
        if (!this.isDefiningPath) {
            return;
        }
    
        // Get canvas relative coordinates
        const rect = this.app.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        console.log(`Path point clicked at screen coordinates: (${x}, ${y})`);
        
        // Convert screen coordinates to world coordinates
        const worldCoords = this.screenToWorldCoordinates(x, y);
        console.log(`Converted to world coordinates: (${worldCoords.x.toFixed(2)}, ${worldCoords.y.toFixed(2)}, ${worldCoords.z.toFixed(2)})`);
        
        // Add the point to our path points
        this.pathPoints.push({
            x: worldCoords.x,
            y: worldCoords.y,
            z: worldCoords.z
        });
        this.displayPathPointInfo(this.pathPoints.length - 1, worldCoords);
        this.displayPathVisualization();
        
        // If we have all three points, complete the path definition
        if (this.pathPoints.length === 3) {
            this.completePathDefinition();
        } else {
            // Update UI for next point
            this.updatePathInfoUI('Click to define point P2 (second control point)');
        }
    }
    calculateViewSize() {
        // Get the current view mode
        const currentViewMode = this.app.viewManager.currentViewMode;
        const viewMode = this.app.viewManager.viewModes[currentViewMode];
        
        // Calculate view size based on camera parameters
        if (viewMode) {
            // Extract camera position and lookAt point
            const cameraPos = viewMode.eye || [0, 10, 0];
            const lookAt = viewMode.lookAt || [0, 0, 0];
            
            // Calculate distance from camera to lookAt point
            const dx = cameraPos[0] - lookAt[0];
            const dy = cameraPos[1] - lookAt[1];
            const dz = cameraPos[2] - lookAt[2];
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Factor in any zoom level if your app supports it
            const zoomFactor = this.app.zoomFactor || 1.0;
            

            return distance * 0.5 / zoomFactor;
        }
        
        return 5.0;
    }

    screenToWorldCoordinates(screenX, screenY) {
        // Convert screen coordinates to normalized device coordinates (NDC)
        const ndcX = (screenX / this.pathCanvas.width) * 2 - 1;
        const ndcY = (screenY / this.pathCanvas.height) * 2 -1; // Flip Y for NDC
        const worldY = this.zHeight || 0;
        
        // Calculate view size dynamically based on camera setup
        const viewSize = this.calculateViewSize();
        
        // Get the "look-at" point from the current view
        const lookAt = this.app.viewManager.viewModes[this.app.viewManager.currentViewMode].lookAt || [0, 0, 0];
        
        // Calculate world X and Z based on NDC coordinates
        // We need to scale based on the view's distance and frustum
        const aspectRatio = this.pathCanvas.width / this.pathCanvas.height;
        const fovRadians = this.app.fov ? (this.app.fov * Math.PI / 180) : (Math.PI / 4); // 45 degrees default
        const frustumHeight = 2.0 * Math.tan(fovRadians / 2) * viewSize;
        const frustumWidth = frustumHeight * aspectRatio;
        
        const worldX = lookAt[0] + (ndcX * frustumWidth / 2);
        const worldZ = lookAt[2] + (ndcY * frustumHeight / 2);
        
        console.log(`Screen to World: Screen(${screenX}, ${screenY}) -> World(${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)}) with viewSize: ${viewSize.toFixed(2)}`);
        
        return {
            x: worldX,
            y: worldY,
            z: worldZ
        };
    }
    
    // Update worldToScreenCoordinates for consistency
    worldToScreenCoordinates(worldX, worldY, worldZ) {
        // Convert world coordinates to normalized screen coordinates
        const viewMatrix = this.app.viewManager.viewModes[this.app.viewManager.currentViewMode].viewMatrix;
        const projMatrix = this.app.projMatrix;
        
        // Create point in world space (vec4 for homogeneous coordinates)
        const worldPoint = new Float32Array([worldX, worldY, worldZ, 1.0]);
        
        // Transform point to view space
        const viewPoint = new Float32Array(4);
        glMatrix.vec4.transformMat4(viewPoint, worldPoint, viewMatrix);
        
        // Transform to clip space
        const clipPoint = new Float32Array(4);
        glMatrix.vec4.transformMat4(clipPoint, viewPoint, projMatrix);
        
        // Perform perspective division to get normalized device coordinates (NDC)
        const ndcX = clipPoint[0] / clipPoint[3];
        const ndcY = clipPoint[1] / clipPoint[3];
        
        // Convert NDC to screen coordinates (pixels)
        const screenX = ((ndcX + 1) / 2) * this.pathCanvas.width;
        const screenY = ((1 - ndcY) / 2) * this.pathCanvas.height; // Flip Y for screen coordinates
        
        return {
            x: screenX,
            y: screenY
        };
    }


    completePathDefinition() {
        console.log("Completing path definition with points:", this.pathPoints);
        
        // Calculate the quadratic curve
        this.calculateQuadraticCurve();
        
        // Display the complete path
        this.displayPathVisualization();
        
        // Switch back to original click handler
        this.app.canvas.removeEventListener('click', this.handleMouseClick);
        this.app.canvas.addEventListener('click', this.app.handleMouseClick);
        
        // Update UI with animation controls
        this.updatePathInfoUI(`
            <div>Path defined successfully!</div>
            <div style="margin: 10px 0;">
                <strong>Control Points:</strong>
                ${this.pathPoints.map((p, i) => 
                    `<div>P${i}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})</div>`
                ).join('')}
            </div>
            <button id="animate-btn" style="width: 100%; padding: 8px; margin-top: 10px; cursor: pointer; background-color: #4CAF50; color: white; border: none; border-radius: 4px;">
                Start Animation
            </button>
        `);
        
        // Add animation button listener
        document.getElementById('animate-btn').addEventListener('click', () => this.animateAlongPath());
        
        // Mark path definition as complete
        this.isDefiningPath = false;
        console.log("Path definition completed");
    }

    calculateQuadraticCurve() {
        // Generate points along the quadratic curve defined by p0, p1, p2
        // Formula: P(t) = (1-t)²P₀ + 2(1-t)tP₁ + t²P₂ where t ∈ [0,1]
        this.curvePoints = [];
        
        const numPoints = 100; // Number of points to calculate along the curve
        
        const p0 = this.pathPoints[0];
        const p1 = this.pathPoints[1];
        const p2 = this.pathPoints[2];
        
        // Log control points for debugging
        console.log('Control points:');
        console.log('P0:', p0);
        console.log('P1:', p1);
        console.log('P2:', p2);
        
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            
            // Quadratic Bezier curve calculation
            const oneMinusT = 1 - t;
            const oneMinusTSquared = oneMinusT * oneMinusT;
            const tSquared = t * t;
            
            const point = {
                x: oneMinusTSquared * p0.x + 2 * oneMinusT * t * p1.x + tSquared * p2.x,
                y: oneMinusTSquared * p0.y + 2 * oneMinusT * t * p1.y + tSquared * p2.y,
                z: oneMinusTSquared * p0.z + 2 * oneMinusT * t * p1.z + tSquared * p2.z
            };
            
            this.curvePoints.push(point);
        }
        
        console.log(`Generated ${this.curvePoints.length} curve points`);
    }

    displayPathVisualization() {
        // Clear previous path visualization
        this.pathContext.clearRect(0, 0, this.pathCanvas.width, this.pathCanvas.height);
        
        // Draw the control points first
        this.pathContext.fillStyle = 'rgba(255, 0, 0, 0.7)';
        for (let i = 0; i < this.pathPoints.length; i++) {
            const point = this.pathPoints[i];
            // Convert from world to screen coordinates
            const screenCoords = this.worldToScreenCoordinates(point.x, point.y, point.z);
            
            this.pathContext.beginPath();
            this.pathContext.arc(screenCoords.x, screenCoords.y, 8, 0, Math.PI * 2);
            this.pathContext.fill();
            
            // Add label
            this.pathContext.fillStyle = 'white';
            this.pathContext.font = '14px Arial';
            this.pathContext.fillText(`P${i}`, screenCoords.x + 10, screenCoords.y);
            
            // Reset fill style for next point
            this.pathContext.fillStyle = 'rgba(255, 0, 0, 0.7)';
        }
        
        // Draw the path curve
        if (this.curvePoints.length > 0) {
            this.pathContext.beginPath();
            
            // Draw first point
            const firstPoint = this.curvePoints[0];
            const firstScreenCoords = this.worldToScreenCoordinates(firstPoint.x, firstPoint.y, firstPoint.z);
            this.pathContext.moveTo(firstScreenCoords.x, firstScreenCoords.y);
            
            // Draw the rest of the curve
            for (let i = 1; i < this.curvePoints.length; i++) {
                const point = this.curvePoints[i];
                const screenCoords = this.worldToScreenCoordinates(point.x, point.y, point.z);
                this.pathContext.lineTo(screenCoords.x, screenCoords.y);
            }
            
            this.pathContext.strokeStyle = 'rgba(255, 255, 0, 0.8)';
            this.pathContext.lineWidth = 3;
            this.pathContext.stroke();
        }
    }

    displayPathPointInfo(index, worldCoords) {
        const pointInfoDiv = document.createElement('div');
        pointInfoDiv.innerHTML = `Point P${index}: (${worldCoords.x.toFixed(2)}, ${worldCoords.y.toFixed(2)}, ${worldCoords.z.toFixed(2)})`;
        document.getElementById('path-info').appendChild(pointInfoDiv);
    }

    updatePathInfoUI(message) {
        const pathInfo = document.getElementById('path-info');
        if (!pathInfo) {
            console.error("Path info element not found");
            return;
        }
        
        pathInfo.innerHTML = `<div>${message}</div>`;
        console.log("Path info updated:", message);
    }

    animateAlongPath() {
        if (this.curvePoints.length === 0) {
            console.error('No path defined for animation');
            alert('No path defined. Please define a path first.');
            return;
        }
        
        if (this.isAnimating) {
            console.log('Animation already in progress');
            return;
        }
        
        console.log("Starting animation along defined path");
        
        // Store the original model position (for reset)
        this.originalModelPosition = {x: 0, y: 0, z: 0}; // All models start at origin
        
        // Start animation
        this.isAnimating = true;
        this.animationStartTime = performance.now();
        this.animationProgress = 0;
        
        // Start animation frame loop
        requestAnimationFrame(this.animateObject.bind(this));
        
        // Update UI
        this.updatePathInfoUI('Animating object along path... <button id="stop-animation-btn">Stop Animation</button>');
        document.getElementById('stop-animation-btn').addEventListener('click', () => {
            this.isAnimating = false;
            this.updatePathInfoUI('Animation stopped. Click "Reset Path" to start over or "Define Movement Path" to create a new path.');
        });
    }

    animateObject(timestamp) {
        if (!this.isAnimating) return;
        
        if (!this.animationStartTime) {
            this.animationStartTime = timestamp;
        }
        
        // Calculate elapsed time
        const elapsed = timestamp - this.animationStartTime;
        this.animationProgress = Math.min(elapsed / this.animationDuration, 1);
        
        // Get the current point on the curve using precise interpolation
        const pointIndex = Math.floor(this.animationProgress * (this.curvePoints.length - 1));
        const nextPointIndex = Math.min(pointIndex + 1, this.curvePoints.length - 1);
        const interpolationFactor = (this.animationProgress * (this.curvePoints.length - 1)) - pointIndex;
        
        // Interpolate between the two closest points
        const p1 = this.curvePoints[pointIndex];
        const p2 = this.curvePoints[nextPointIndex];
        
        const currentPoint = {
            x: p1.x + (p2.x - p1.x) * interpolationFactor,
            y: p1.y + (p2.y - p1.y) * interpolationFactor,
            z: p1.z + (p2.z - p1.z) * interpolationFactor
        };
        
        // Update the model's position
        this.updateModelPosition(currentPoint);
        
        // Draw a marker at the current point location for visualization
        this.drawAnimationMarker(currentPoint);
        
        // Continue animation if not finished
        if (this.animationProgress < 1) {
            requestAnimationFrame(this.animateObject.bind(this));
        } else {
            // Animation complete
            this.isAnimating = false;
            this.updatePathInfoUI('Animation complete! <button id="reset-path-btn-2">Reset Path</button> <button id="start-new-path-btn">New Path</button>');
            document.getElementById('reset-path-btn-2').addEventListener('click', this.resetPath);
            document.getElementById('start-new-path-btn').addEventListener('click', this.startPathDefinition);
        }
    }
    drawAnimationMarker(worldPoint) {
        // Draw the path visualization first (to show the complete path)
        this.displayPathVisualization();
        
        // Convert world coordinates to screen coordinates
        const screenCoords = this.worldToScreenCoordinates(worldPoint.x, worldPoint.y, worldPoint.z);
        
        // Draw the marker
        this.pathContext.fillStyle = 'rgba(0, 255, 0, 0.8)';
        this.pathContext.beginPath();
        this.pathContext.arc(screenCoords.x, screenCoords.y, 10, 0, Math.PI * 2);
        this.pathContext.fill();
        
        // Add a "current position" label
        this.pathContext.fillStyle = 'white';
        this.pathContext.font = '12px Arial';
        this.pathContext.fillText('Current', screenCoords.x + 12, screenCoords.y - 5);
        this.pathContext.fillText('Position', screenCoords.x + 12, screenCoords.y + 10);
    }

    updateModelPosition(position) {
        if (this.app.selectedObjectIndex === -1) return;
        
        // Get the selected model
        const selectedModel = this.app.models[this.app.selectedObjectIndex];
        
        // Store original vertices if not stored yet
        if (!selectedModel.originalVertices) {
            selectedModel.originalVertices = new Float32Array(selectedModel.vertices);
        }
        
        // Make a copy of the original vertices
        const newVertices = new Float32Array(selectedModel.originalVertices);
        
        // Apply offset to each vertex
        for (let i = 0; i < newVertices.length; i += 3) {
            newVertices[i] = selectedModel.originalVertices[i] + position.x;
            newVertices[i + 1] = selectedModel.originalVertices[i + 1] + position.y;
            newVertices[i + 2] = selectedModel.originalVertices[i + 2] + position.z;
        }
        
        // Update the model's vertices
        selectedModel.vertices = newVertices;
        
        // Update the WebGL buffer
        const gl = this.app.renderer.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[this.app.selectedObjectIndex].vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, selectedModel.vertices, gl.STATIC_DRAW);
    }

    resetPath() {
        console.log("Resetting path...");
        
        // Clear path points
        this.pathPoints = [];
        this.curvePoints = [];
        
        // Reset animation
        this.isAnimating = false;
        this.animationProgress = 0;
        this.animationStartTime = null;
        
        // Clear canvas
        if (this.pathContext) {
            this.pathContext.clearRect(0, 0, this.pathCanvas.width, this.pathCanvas.height);
        }
        
        // Reset model position if needed
        if (this.app.selectedObjectIndex !== -1 && this.app.models[this.app.selectedObjectIndex].originalVertices) {
            const selectedModel = this.app.models[this.app.selectedObjectIndex];
            
            // Restore original vertices
            selectedModel.vertices = new Float32Array(selectedModel.originalVertices);
            
            // Update the WebGL buffer
            const gl = this.app.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[this.app.selectedObjectIndex].vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, selectedModel.vertices, gl.STATIC_DRAW);
        }
        
        // Reset UI
        this.updatePathInfoUI('Path reset. Select an object and press "Define Movement Path" to start.');
        
        // If we were in path definition mode, restore the original click handler
        if (this.isDefiningPath) {
            this.app.canvas.removeEventListener('click', this.handleMouseClick);
            this.app.canvas.addEventListener('click', this.app.handleMouseClick);
            this.isDefiningPath = false;
        }
        
        console.log("Path reset complete");
    }
}