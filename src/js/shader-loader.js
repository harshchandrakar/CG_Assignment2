class ShaderLoader {
    static async loadShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    static async loadProgram(gl, vertexShaderSource, fragmentShaderSource) {
        const vertexShader = await this.loadShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = await this.loadShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    static async fetchShaderSource(url) {
        const response = await fetch(url);
        return await response.text();
    }
}