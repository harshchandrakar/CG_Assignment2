class OBJLoader {
    static async loadModel(url) {
        const response = await fetch(url);
        const text = await response.text();
        
        // Use Mesh from webgl-obj-loader
        const mesh = new OBJ.Mesh(text);
        
        return {
            vertices: new Float32Array(mesh.vertices),
            indices: new Uint16Array(mesh.indices),
            colors: this.generateSolidBlueColors(mesh.vertices.length / 3),
            texCoords: new Float32Array(mesh.textures || [])
        };
    }

    // Generate solid blue colors for entire model
    static generateSolidBlueColors(vertexCount) {
        const colors = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
            // Solid blue color
            colors[i * 3] = 0.0;     // Red
            colors[i * 3 + 1] = 0.0; // Green
            colors[i * 3 + 2] = 1.0; // Blue
        }
        return colors;
    }
}