class ObjectMovementController {
    constructor(app) {
        this.app = app;
        this.pathPoints = []; 
        this.isDefiningPath = false; 
        this.curvePoints = []; 
        this.animationStartTime = null; 
        this.animationDuration = 3000; 
        this.minDuration = 1000;   
        this.maxDuration = 10000; 
        this.isAnimating = false; 
        this.animationProgress = 0; 
        this.originalModelPosition = null; 
        this.zHeight = 0.5; 
        this.viewSize = 4; 
        this.highlightColor = [1.0, 0.5, 0.0];
        this.clickedPoint = null;
        
        this.handleMouseClick = this.handleMouseClick.bind(this);
        this.startPathDefinition = this.startPathDefinition.bind(this);
        this.calculateQuadraticCurve = this.calculateQuadraticCurve.bind(this);
        this.animateAlongPath = this.animateAlongPath.bind(this);
        this.resetPath = this.resetPath.bind(this);
        this.displayPathPointInfo = this.displayPathPointInfo.bind(this);
        this.displayPathVisualization = this.displayPathVisualization.bind(this);
        this.screenToWorldCoordinates = this.screenToWorldCoordinates.bind(this);
        this.worldToScreenCoordinates = this.worldToScreenCoordinates.bind(this);
        
        this.pickObject = this.pickObject.bind(this);
        this.selectObject = this.selectObject.bind(this);
        this.resetSelection = this.resetSelection.bind(this);
        this.displaySelectionInfo = this.displaySelectionInfo.bind(this);
    }

    init() {
        this.addMovementControlUI();
        this.addControlPanel();
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

    handleObjectSelection(ndcX, ndcY) {
        const modelIndex = this.pickObject(ndcX, ndcY);
        
        console.log(`Picked model index: ${modelIndex}`);
        
        if (modelIndex !== -1 && modelIndex < this.app.models.length) {
            this.selectObject(modelIndex);
        } else {
            if (this.app.selectedObjectIndex !== -1) {
                this.resetSelection();
            }
        }
    }
    changeAnimationSpeed(percentChange) {
        const newDuration = this.animationDuration * (1 + percentChange/100);
        this.animationDuration = Math.min(this.maxDuration, Math.max(this.minDuration, newDuration));
        
        // Update slider and display
        const slider = document.getElementById('speedSlider');
        const display = document.getElementById('speedValue');
        if (slider && display) {
            slider.value = (this.animationDuration/1000).toFixed(1);
            display.textContent = `${(this.animationDuration/1000).toFixed(1)}s`;
        }
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
        
        const selectedModel = this.app.models[this.app.selectedObjectIndex];
        let startPoint;
        
        if (this.clickedPoint) {
            startPoint = this.clickedPoint;
        } else if (selectedModel.currentPosition) {
            startPoint = selectedModel.currentPosition;
        } else {
            startPoint = { x: 0, y: 0, z: this.zHeight };
        }
        
        this.pathPoints.push({
            x: startPoint.x,
            y: startPoint.y,
            z: startPoint.z
        });
        
        this.displayPathPointInfo(0, startPoint);
        this.updatePathInfoUI('Click to define point P1 (first control point)');
        
        this.originalClickHandler = this.app.handleMouseClick;
        this.app.canvas.removeEventListener('click', this.app.handleMouseClick);
        this.app.canvas.addEventListener('click', this.handleMouseClick);
    }

    handleMouseClick(event) {
        const rect = this.app.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        if (this.isDefiningPath) {
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
        } else {
            if (this.app.viewManager.currentViewMode !== 'topView') {
                console.log('Object picking is only available in Top View mode.');
                return;
            }
            
            const worldCoords = this.screenToWorldCoordinates(x, y);
            this.clickedPoint = worldCoords;
            
            let selectedIndex = -1;
            let minDistance = Infinity;
            
            for (let i = 0; i < this.app.models.length; i++) {
                const model = this.app.models[i];
                
                if (model.currentPosition) {
                    const dx = - worldCoords.x + model.currentPosition.x;
                    const dz = -worldCoords.z + model.currentPosition.z;
                    const distanceSquared = dx * dx + dz * dz;
                    
                    let radius = 0.5;
                    console.log("selected");
                    
                    if (model.vertices && model.vertices.length > 0) {
                        let maxDist = 0;
                        for (let j = 0; j < model.vertices.length; j += 3) {
                            const vx = model.vertices[j];
                            const vz = model.vertices[j + 2];
                            const vdx = vx - model.currentPosition.x;
                            const vdz = vz - model.currentPosition.z;
                            const vdist = Math.sqrt(vdx * vdx + vdz * vdz);
                            if (vdist > maxDist) maxDist = vdist;
                        }
                        radius = maxDist > 0 ? maxDist : radius;
                    }
                    
                    const selectionRadius = radius * 1.2;
                    
                    if (distanceSquared <= selectionRadius * selectionRadius && distanceSquared < minDistance) {
                        minDistance = distanceSquared;
                        selectedIndex = i;
                    }
                }
            }
            
            if (selectedIndex === -1) {
                selectedIndex = this.pickObject(
                    (x / this.app.canvas.width) * 2 - 1,
                    -((y / this.app.canvas.height) * 2 - 1)
                );
            }
            
            if (selectedIndex !== -1) {
                this.selectObject(selectedIndex);
            } else if (this.app.selectedObjectIndex !== -1) {
                this.resetSelection();
            }
        }
    }
    
pickObject(ndcX, ndcY) {
    const viewMode = this.app.viewManager.viewModes[this.app.viewManager.currentViewMode];
    const viewMatrix = viewMode.viewMatrix;
    const projMatrix = this.app.projMatrix;

    const viewProj = glMatrix.mat4.create();
    glMatrix.mat4.multiply(viewProj, projMatrix, viewMatrix);
    const invViewProj = glMatrix.mat4.create();
    glMatrix.mat4.invert(invViewProj, viewProj);

    const rayOrigin = glMatrix.vec4.fromValues(ndcX, -ndcY, -1.0, 1.0);
    const rayEnd = glMatrix.vec4.fromValues(ndcX, -ndcY, 1.0, 1.0);
    
    glMatrix.vec4.transformMat4(rayOrigin, rayOrigin, invViewProj);
    glMatrix.vec4.transformMat4(rayEnd, rayEnd, invViewProj);
    
    glMatrix.vec4.scale(rayOrigin, rayOrigin, 1.0/rayOrigin[3]);
    glMatrix.vec4.scale(rayEnd, rayEnd, 1.0/rayEnd[3]);
    
    const rayDirection = glMatrix.vec3.create();
    glMatrix.vec3.sub(rayDirection, rayEnd, rayOrigin);
    glMatrix.vec3.normalize(rayDirection, rayDirection);

    let closestModelIndex = -1;
    let closestDistance = Infinity;

    for (let i = 0; i < this.app.models.length; i++) {
        const model = this.app.models[i];
        const center = model.currentPosition || { x: 0, y: 0, z: 0 };

        let maxDistance = 0;
        if (model.originalVertices) {
            for (let j = 0; j < model.originalVertices.length; j += 3) {
                const dx = model.originalVertices[j] - (model.originalCenter?.x || 0);
                const dy = model.originalVertices[j+1] - (model.originalCenter?.y || 0);
                const dz = model.originalVertices[j+2] - (model.originalCenter?.z || 0);
                maxDistance = Math.max(maxDistance, Math.sqrt(dx*dx + dy*dy + dz*dz));
            }
        }
        const radius = (maxDistance || 0.5) * 1.2;

        const oc = glMatrix.vec3.fromValues(
            rayOrigin[0] - center.x,
            rayOrigin[1] - center.y,
            rayOrigin[2] - center.z
        );
        
        const a = glMatrix.vec3.dot(rayDirection, rayDirection);
        const b = 2.0 * glMatrix.vec3.dot(oc, rayDirection);
        const c = glMatrix.vec3.dot(oc, oc) - radius * radius;
        const discriminant = b*b - 4*a*c;

        if (discriminant >= 0) {
            const t = (-b - Math.sqrt(discriminant)) / (2.0*a);
            if (t >= 0 && t < closestDistance) {
                closestDistance = t;
                closestModelIndex = i;
            }
        }
    }

    return closestModelIndex;
}
    resetSelection() {
        if (this.app.selectedObjectIndex !== -1 && this.app.selectedObjectIndex < this.app.models.length) {
            console.log(`Resetting selection: ${this.app.selectedObjectIndex}`);
            
            const originalColorArray = this.app.originalColors[this.app.selectedObjectIndex];
            const model = this.app.models[this.app.selectedObjectIndex];
            
            model.colors = new Float32Array(originalColorArray);
            
            const gl = this.app.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[this.app.selectedObjectIndex].colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, model.colors, gl.STATIC_DRAW);
            
            const infoDiv = document.getElementById('selection-info');
            if (infoDiv) {
                infoDiv.remove();
            }
            
            this.app.selectedObjectIndex = -1;
        }
    }
    selectObject(index) {
        console.log(`Selecting object at index ${index}: ${this.app.modelNames[index]}`);
        
        if (this.app.selectedObjectIndex !== -1 && this.app.selectedObjectIndex < this.app.models.length) {
            console.log(`Resetting previous selection: ${this.app.selectedObjectIndex}`);
            
            const originalColorArray = this.app.originalColors[this.app.selectedObjectIndex];
            const model = this.app.models[this.app.selectedObjectIndex];
            
            model.colors = new Float32Array(originalColorArray);
            
            const gl = this.app.renderer.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[this.app.selectedObjectIndex].colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, model.colors, gl.STATIC_DRAW);
        }
        
        this.app.selectedObjectIndex = index;
        
        const selectedModel = this.app.models[index];
        if (!selectedModel.currentPosition) {
            selectedModel.currentPosition = { x: 0, y: 0, z: 0 };
        }
        
        if (this.clickedPoint) {
            selectedModel.currentPosition = {
                x: this.clickedPoint.x,
                y: this.clickedPoint.y,
                z: this.clickedPoint.z
            };
        }
        
        const newColors = new Float32Array(selectedModel.colors.length);
        
        for (let i = 0; i < selectedModel.colors.length; i += 3) {
            newColors[i] = this.highlightColor[0];
            newColors[i + 1] = this.highlightColor[1];
            newColors[i + 2] = this.highlightColor[2];
        }
        
        selectedModel.colors = newColors;
        
        const gl = this.app.renderer.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[index].colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, selectedModel.colors, gl.STATIC_DRAW);
        
        console.log(`Selected model: ${this.app.modelNames[index]}`);
        
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
            ${this.app.modelNames[index]}
        `;
        document.body.appendChild(infoDiv);
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
        
        this.updatePathInfoUI(`
            Animating... (Speed: ${(5000/this.animationDuration).toFixed(1)}x)
            <button id="stop-animation-btn">Stop</button>
        `);
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
            // Deselect object and reset path
            this.app.selectedObjectIndex = -1;
            this.resetPath();
            this.updatePathInfoUI('Animation complete! Object deselected.');
            
            // Remove existing selection info
            const infoDiv = document.getElementById('selection-info');
            if (infoDiv) infoDiv.remove();
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
        
        selectedModel.currentPosition = {
            x: position.x,
            y: position.y,
            z: position.z
        };
        
        console.log(`Updating object position to: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
        
        const newVertices = new Float32Array(selectedModel.originalVertices.length);
        
        if (!selectedModel.originalCenter) {
            let sumX = 0, sumY = 0, sumZ = 0;
            let count = 0;
            
            for (let i = 0; i < selectedModel.originalVertices.length; i += 3) {
                sumX += selectedModel.originalVertices[i];
                sumY += selectedModel.originalVertices[i + 1];
                sumZ += selectedModel.originalVertices[i + 2];
                count++;
            }
            
            if (count > 0) {
                selectedModel.originalCenter = {
                    x: sumX / count,
                    y: sumY / count,
                    z: sumZ / count
                };
            } else {
                selectedModel.originalCenter = { x: 0, y: 0, z: 0 };
            }
        }
        
        // Get current scale and rotation values
        const scale = selectedModel.scale || 1.0;
        const rotation = selectedModel.rotation || { x: 0, y: 0, z: 0 };
        
        for (let i = 0; i < selectedModel.originalVertices.length; i += 3) {
            // Center and scale the vertex
            let x = (selectedModel.originalVertices[i] - selectedModel.originalCenter.x) * scale;
            let y = (selectedModel.originalVertices[i + 1] - selectedModel.originalCenter.y) * scale;
            let z = (selectedModel.originalVertices[i + 2] - selectedModel.originalCenter.z) * scale;
    
            // Apply rotations
            const rotated = glMatrix.vec3.fromValues(x, y, z);
            glMatrix.vec3.rotateX(rotated, rotated, [0, 0, 0], rotation.x);
            glMatrix.vec3.rotateY(rotated, rotated, [0, 0, 0], rotation.y);
            glMatrix.vec3.rotateZ(rotated, rotated, [0, 0, 0], rotation.z);
    
            // Translate to target position
            newVertices[i] = rotated[0] + position.x;
            newVertices[i + 1] = rotated[1] + position.y;
            newVertices[i + 2] = rotated[2] + position.z;
        }
        
        selectedModel.vertices = newVertices;
        
        const gl = this.app.renderer.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.app.buffers[this.app.selectedObjectIndex].vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, selectedModel.vertices, gl.STATIC_DRAW);
    }

    addControlPanel() {
        const controlPanel = document.createElement('div');
        controlPanel.id = 'control-panel';
        Object.assign(controlPanel.style, {
            position: 'absolute',
            top: '50px',
            right: '10px',
            backgroundColor: 'rgba(20, 20, 30, 0.85)',
            color: 'white',
            padding: '15px',
            borderRadius: '8px',
            zIndex: '1000',
            fontFamily: 'Arial, sans-serif',
            width: '320px',
            maxHeight: '70vh',
            overflowY: 'auto',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
        });
    
        controlPanel.innerHTML = `
        <h2 style="margin-top: 0; text-align: center; color: #8CF; border-bottom: 1px solid #8CF; padding-bottom: 10px;">Controls Panel</h2>
        
        <div style="margin-bottom: 20px; background-color: rgba(60,120,200,0.2); padding: 12px; border-radius: 6px; border-left: 4px solid #5AF;">
            <h3 style="margin-top: 0; color: #8CF;">Animation Speed</h3>
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
                <input type="range" id="speedSlider" min="1" max="10" step="0.5" value="${this.animationDuration/1000}" style="flex-grow: 1; accent-color: #5AF;">
                <span id="speedValue" style="font-weight: bold; min-width: 30px;">${(this.animationDuration/1000).toFixed(1)}s</span>
            </div>
            <div style="margin-top: 8px; font-size: 0.9em; display: flex; justify-content: space-between;">
                <span><kbd style="background: #555; padding: 2px 5px; border-radius: 3px;">[</kbd> Slow Down 20%</span>
                <span><kbd style="background: #555; padding: 2px 5px; border-radius: 3px;">]</kbd> Speed Up 20%</span>
            </div>
        </div>
        
        <div style="margin-bottom: 20px; background-color: rgba(80,200,120,0.2); padding: 12px; border-radius: 6px; border-left: 4px solid #6D3;">
            <h3 style="margin-top: 0; color: #8E6;">View Controls</h3>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;">
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">T</kbd>
                <div>Toggle Top View</div>
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">Y</kbd>
                <div>Toggle 3D View</div>
                <div style="grid-column: span 2; margin-top: 5px;">
                    <strong>Mouse Drag:</strong> Rotate Camera (3D View)
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 20px; background-color: rgba(255,160,50,0.2); padding: 12px; border-radius: 6px; border-left: 4px solid #FA5;">
            <h3 style="margin-top: 0; color: #FC8;">Object Manipulation</h3>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;">
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">W</kbd>
                <div>Rotate X-axis</div>
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">A</kbd>
                <div>Rotate Y-axis</div>
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">D</kbd>
                <div>Rotate Z-axis</div>
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">+</kbd>
                <div>Scale Up (+0.1)</div>
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">-</kbd>
                <div>Scale Down (-0.1)</div>
                <div style="grid-column: span 2; margin-top: 5px;">
                    <strong>Click:</strong> Select Object
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 20px; background-color: rgba(200,100,200,0.2); padding: 12px; border-radius: 6px; border-left: 4px solid #D8D;">
            <h3 style="margin-top: 0; color: #DAD;">Path Controls</h3>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: center;">
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">M</kbd>
                <div>Start Path Drawing</div>
                <kbd style="background: #555; padding: 2px 6px; border-radius: 3px; text-align: center;">R</kbd>
                <div>Reset Path</div>
                <div style="grid-column: span 2; margin-top: 5px;">
                    <strong>Click:</strong> Place Control Points
                </div>
                <div style="grid-column: span 2;">
                    <strong>Enter:</strong> Confirm Path
                </div>
            </div>
        </div>
        
        <div style="margin-top: 15px; font-size: 0.9em; background-color: rgba(180,180,200,0.2); padding: 12px; border-radius: 6px;">
            <h3 style="margin-top: 0; color: #AAF;">Notes</h3>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.4;">
                <li>Rotation/Scaling works only in Top View</li>
                <li>Minimum Scale: 0.1x</li>
                <li>Speed range: 1-10 seconds</li>
                <li>Selected object turns orange</li>
            </ul>
        </div>
        `;
    
        document.body.appendChild(controlPanel);
    
        // Speed slider handler
        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        speedSlider.addEventListener('input', (e) => {
            this.animationDuration = e.target.value * 1000;
            speedValue.textContent = `${e.target.value}s`;
        });
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
        
        this.updatePathInfoUI('Path reset. Select an object and press "Define Movement Path" to start.');
        
        if (this.isDefiningPath) {
            this.app.canvas.removeEventListener('click', this.handleMouseClick);
            this.app.canvas.addEventListener('click', this.app.handleMouseClick);
            this.isDefiningPath = false;
        }
        // this.app.selectedObjectIndex = -1;
        const infoDiv = document.getElementById('selection-info');
        if (infoDiv) infoDiv.remove();
    }
}