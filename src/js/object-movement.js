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
        this.createPathCanvas();
        
        window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 'm') {
                this.startPathDefinition();
            }
            else if (event.key.toLowerCase() === 'r') {
                this.resetPath();
            }
        });
    }

    createPathCanvas() {
        const existingCanvas = document.getElementById('path-canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }
    
        const pathCanvas = document.createElement('canvas');
        pathCanvas.id = 'path-canvas';
        
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
            zIndex: '100'
        });
        
        pathCanvas.width = glCanvas.width;
        pathCanvas.height = glCanvas.height;
        
        document.body.appendChild(pathCanvas);
        
        this.pathCanvas = pathCanvas;
        this.pathContext = pathCanvas.getContext('2d');
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
            zIndex: '1000',
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
    
        document.getElementById('start-path-btn').addEventListener('click', this.startPathDefinition);
        document.getElementById('reset-path-btn').addEventListener('click', this.resetPath);
    }    

    startPathDefinition() {
        if (this.app.viewManager.currentViewMode !== 'topView') {
            alert('Please switch to Top View (press T) before defining a movement path.');
            return;
        }
    
        if (this.app.selectedObjectIndex === -1) {
            alert('Please select an object first before defining a movement path.');
            return;
        }
    
        this.resetPath();
    
        this.isDefiningPath = true;
        
        this.pathPoints.push({
            x: 0,
            y: 0,
            z: 0
        });
        
        this.updatePathInfoUI('Click to define point P1 (first control point)');
        
        this.originalClickHandler = this.app.handleMouseClick;
        this.app.canvas.removeEventListener('click', this.app.handleMouseClick);
        this.app.canvas.addEventListener('click', this.handleMouseClick);
    }

    handleMouseClick(event) {
        if (!this.isDefiningPath) {
            return;
        }
    
        const rect = this.app.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const worldCoords = this.screenToWorldCoordinates(x, y);
        
        this.pathPoints.push({
            x: worldCoords.x,
            y: worldCoords.y,
            z: worldCoords.z
        });
        this.displayPathPointInfo(this.pathPoints.length - 1, worldCoords);
        this.displayPathVisualization();
        
        if (this.pathPoints.length === 3) {
            this.completePathDefinition();
        } else {
            this.updatePathInfoUI('Click to define point P2 (second control point)');
        }
    }

    calculateViewSize() {
        const currentViewMode = this.app.viewManager.currentViewMode;
        const viewMode = this.app.viewManager.viewModes[currentViewMode];
        
        if (viewMode) {
            const cameraPos = viewMode.eye || [0, 10, 0];
            const lookAt = viewMode.lookAt || [0, 0, 0];
            
            const dx = cameraPos[0] - lookAt[0];
            const dy = cameraPos[1] - lookAt[1];
            const dz = cameraPos[2] - lookAt[2];
            const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            const zoomFactor = this.app.zoomFactor || 1.0;
            
            return distance * 0.5 / zoomFactor;
        }
        
        return 5.0;
    }

    screenToWorldCoordinates(screenX, screenY) {
        const ndcX = (screenX / this.pathCanvas.width) * 2 - 1;
        const ndcY = (screenY / this.pathCanvas.height) * 2 -1;
        const worldY = this.zHeight || 0;
        
        const viewSize = this.calculateViewSize();
        
        const lookAt = this.app.viewManager.viewModes[this.app.viewManager.currentViewMode].lookAt || [0, 0, 0];
        
        const aspectRatio = this.pathCanvas.width / this.pathCanvas.height;
        const fovRadians = this.app.fov ? (this.app.fov * Math.PI / 180) : (Math.PI / 4);
        const frustumHeight = 2.0 * Math.tan(fovRadians / 2) * viewSize;
        const frustumWidth = frustumHeight * aspectRatio;
        
        const worldX = lookAt[0] + (ndcX * frustumWidth / 2);
        const worldZ = lookAt[2] + (ndcY * frustumHeight / 2);
        
        return {
            x: worldX,
            y: worldY,
            z: worldZ
        };
    }
    
    worldToScreenCoordinates(worldX, worldY, worldZ) {
        const viewMatrix = this.app.viewManager.viewModes[this.app.viewManager.currentViewMode].viewMatrix;
        const projMatrix = this.app.projMatrix;
        
        const worldPoint = new Float32Array([worldX, worldY, worldZ, 1.0]);
        
        const viewPoint = new Float32Array(4);
        glMatrix.vec4.transformMat4(viewPoint, worldPoint, viewMatrix);
        
        const clipPoint = new Float32Array(4);
        glMatrix.vec4.transformMat4(clipPoint, viewPoint, projMatrix);
        
        const ndcX = clipPoint[0] / clipPoint[3];
        const ndcY = clipPoint[1] / clipPoint[3];
        
        const screenX = ((ndcX + 1) / 2) * this.pathCanvas.width;
        const screenY = ((1 - ndcY) / 2) * this.pathCanvas.height;
        
        return {
            x: screenX,
            y: screenY
        };
    }

    completePathDefinition() {
        this.calculateQuadraticCurve();
        
        this.displayPathVisualization();
        
        this.app.canvas.removeEventListener('click', this.handleMouseClick);
        this.app.canvas.addEventListener('click', this.app.handleMouseClick);
        
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
        
        document.getElementById('animate-btn').addEventListener('click', () => this.animateAlongPath());
        
        this.isDefiningPath = false;
    }

    calculateQuadraticCurve() {
        this.curvePoints = [];
        
        const numPoints = 100;
        
        const p0 = this.pathPoints[0];
        const p1 = this.pathPoints[1];
        const p2 = this.pathPoints[2];
        
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            
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
    }

    displayPathVisualization() {
        this.pathContext.clearRect(0, 0, this.pathCanvas.width, this.pathCanvas.height);
        
        this.pathContext.fillStyle = 'rgba(255, 0, 0, 0.7)';
        for (let i = 0; i < this.pathPoints.length; i++) {
            const point = this.pathPoints[i];
            const screenCoords = this.worldToScreenCoordinates(point.x, point.y, point.z);
            
            this.pathContext.beginPath();
            this.pathContext.arc(screenCoords.x, screenCoords.y, 8, 0, Math.PI * 2);
            this.pathContext.fill();
            
            this.pathContext.fillStyle = 'white';
            this.pathContext.font = '14px Arial';
            this.pathContext.fillText(`P${i}`, screenCoords.x + 10, screenCoords.y);
            
            this.pathContext.fillStyle = 'rgba(255, 0, 0, 0.7)';
        }
        
        if (this.curvePoints.length > 0) {
            this.pathContext.beginPath();
            
            const firstPoint = this.curvePoints[0];
            const firstScreenCoords = this.worldToScreenCoordinates(firstPoint.x, firstPoint.y, firstPoint.z);
            this.pathContext.moveTo(firstScreenCoords.x, firstScreenCoords.y);
            
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
            return;
        }
        
        pathInfo.innerHTML = `<div>${message}</div>`;
    }

    animateAlongPath() {
        if (this.curvePoints.length === 0) {
            alert('No path defined. Please define a path first.');
            return;
        }
        
        if (this.isAnimating) {
            return;
        }
        
        this.originalModelPosition = {x: 0, y: 0, z: 0};
        
        this.isAnimating = true;
        this.animationStartTime = performance.now();
        this.animationProgress = 0;
        
        requestAnimationFrame(this.animateObject.bind(this));
        
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
        
        const elapsed = timestamp - this.animationStartTime;
        this.animationProgress = Math.min(elapsed / this.animationDuration, 1);
        
        const pointIndex = Math.floor(this.animationProgress * (this.curvePoints.length - 1));
        const nextPointIndex = Math.min(pointIndex + 1, this.curvePoints.length - 1);
        const interpolationFactor = (this.animationProgress * (this.curvePoints.length - 1)) - pointIndex;
        
        const p1 = this.curvePoints[pointIndex];
        const p2 = this.curvePoints[nextPointIndex];
        
        const currentPoint = {
            x: p1.x + (p2.x - p1.x) * interpolationFactor,
            y: p1.y + (p2.y - p1.y) * interpolationFactor,
            z: p1.z + (p2.z - p1.z) * interpolationFactor
        };
        
        this.updateModelPosition(currentPoint);
        
        this.drawAnimationMarker(currentPoint);
        
        if (this.animationProgress < 1) {
            requestAnimationFrame(this.animateObject.bind(this));
        } else {
            this.isAnimating = false;
            this.updatePathInfoUI('Animation complete! <button id="reset-path-btn-2">Reset Path</button> <button id="start-new-path-btn">New Path</button>');
            document.getElementById('reset-path-btn-2').addEventListener('click', this.resetPath);
            document.getElementById('start-new-path-btn').addEventListener('click', this.startPathDefinition);
        }
    }

    drawAnimationMarker(worldPoint) {
        this.displayPathVisualization();
        
        const screenCoords = this.worldToScreenCoordinates(worldPoint.x, worldPoint.y, worldPoint.z);
        
        this.pathContext.fillStyle = 'rgba(0, 255, 0, 0.8)';
        this.pathContext.beginPath();
        this.pathContext.arc(screenCoords.x, screenCoords.y, 10, 0, Math.PI * 2);
        this.pathContext.fill();
        
        this.pathContext.fillStyle = 'white';
        this.pathContext.font = '12px Arial';
        this.pathContext.fillText('Current', screenCoords.x + 12, screenCoords.y - 5);
        this.pathContext.fillText('Position', screenCoords.x + 12, screenCoords.y + 10);
    }

    updateModelPosition(position) {
        if (this.app.selectedObjectIndex === -1) return;
        
        const selectedModel = this.app.models[this.app.selectedObjectIndex];
        
        if (!selectedModel.originalVertices) {
            selectedModel.originalVertices = new Float32Array(selectedModel.vertices);
        }
        
        const newVertices = new Float32Array(selectedModel.originalVertices);
        
        for (let i = 0; i < newVertices.length; i += 3) {
            newVertices[i] = selectedModel.originalVertices[i] + position.x;
            newVertices[i + 1] = selectedModel.originalVertices[i + 1] + position.y;
            newVertices[i + 2] = selectedModel.originalVertices[i + 2] + position.z;
        }
        
        selectedModel.vertices = newVertices;
        
        const gl = this.app.renderer.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[this.app.selectedObjectIndex].vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, selectedModel.vertices, gl.STATIC_DRAW);
    }

    resetPath() {
        this.pathPoints = [];
        this.curvePoints = [];
        
        this.isAnimating = false;
        this.animationProgress = 0;
        this.animationStartTime = null;
        
        if (this.pathContext) {
            this.pathContext.clearRect(0, 0, this.pathCanvas.width, this.pathCanvas.height);
        }
        
        if (this.app.selectedObjectIndex !== -1 && this.app.models[this.app.selectedObjectIndex].originalVertices) {
            const selectedModel = this.app.models[this.app.selectedObjectIndex];
            
            selectedModel.vertices = new Float32Array(selectedModel.originalVertices);
            
            const gl = this.app.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[this.app.selectedObjectIndex].vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, selectedModel.vertices, gl.STATIC_DRAW);
        }
        
        this.updatePathInfoUI('Path reset. Select an object and press "Define Movement Path" to start.');
        
        if (this.isDefiningPath) {
            this.app.canvas.removeEventListener('click', this.handleMouseClick);
            this.app.canvas.addEventListener('click', this.app.handleMouseClick);
            this.isDefiningPath = false;
        }
    }
}