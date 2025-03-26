class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl');

        if (!this.gl) {
            console.log('WebGL not supported, falling back on experimental-webgl');
            this.gl = canvas.getContext('experimental-webgl');
        }

        if (!this.gl) {
            throw new Error('Your browser does not support WebGL');
        }

        this.setupWebGL();
    }

    setupWebGL() {
        const gl = this.gl;
        
        // Set clear color to a light gray
        gl.clearColor(0.2, 0.2, 0.2, 1.0);
        
        // Enable depth testing to ensure proper rendering of faces
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);  // Default depth function for most 3D rendering
        
        // Enable back-face culling with more robust settings
        gl.enable(gl.CULL_FACE);
        gl.frontFace(gl.CCW);   // Counter-clockwise winding order
        gl.cullFace(gl.BACK);   // Cull back faces
        
        // Clear both color and depth buffers
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    createBuffers(model) {
        const gl = this.gl;

        // Vertex Buffer
        const vertexBufferObject = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferObject);
        gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);

        // Color Buffer
        const colorBufferObject = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBufferObject);
        gl.bufferData(gl.ARRAY_BUFFER, model.colors, gl.STATIC_DRAW);

        // Index Buffer
        const indexBufferObject = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBufferObject);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indices, gl.STATIC_DRAW);

        return {
            vertexBuffer: vertexBufferObject,
            colorBuffer: colorBufferObject,
            indexBuffer: indexBufferObject
        };
    }

    setupAttributes(program, buffers) {
        const gl = this.gl;

        // Position Attribute
        const positionAttribLocation = gl.getAttribLocation(program, 'vertPosition');
        if (positionAttribLocation !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.vertexBuffer);
            gl.vertexAttribPointer(
                positionAttribLocation, 
                3, 
                gl.FLOAT, 
                gl.FALSE,
                3 * Float32Array.BYTES_PER_ELEMENT, 
                0
            );
            gl.enableVertexAttribArray(positionAttribLocation);
        }

        // Color Attribute
        const colorAttribLocation = gl.getAttribLocation(program, 'vertColor');
        if (colorAttribLocation !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colorBuffer);
            gl.vertexAttribPointer(
                colorAttribLocation, 
                3, 
                gl.FLOAT, 
                gl.FALSE,
                3 * Float32Array.BYTES_PER_ELEMENT, 
                0
            );
            gl.enableVertexAttribArray(colorAttribLocation);
        }

        // Bind index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indexBuffer);
    }

    render(program, model) {
        const gl = this.gl;
        gl.useProgram(program);

        // Render the model using indexed drawing
        gl.drawElements(gl.TRIANGLES, model.indices.length, gl.UNSIGNED_SHORT, 0);
    }
}