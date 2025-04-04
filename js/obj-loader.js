class OBJLoader {
    static async loadModel(url) {
        const response = await fetch(url);
        const text = await response.text();
        
        // Use Mesh from webgl-obj-loader
        const mesh = new OBJ.Mesh(text);
        
        return {
            vertices: new Float32Array(mesh.vertices),
            indices: new Uint16Array(mesh.indices),
            colors: this.generateUniqueColor(mesh.vertices.length / 3),
            texCoords: new Float32Array(mesh.textures || [])
        };
    }

    // Generate a unique, vibrant color avoiding white and black
    static generateUniqueColor(vertexCount) {
        // Vibrant color palette, excluding white and black
        const colorPalette = [
            [1.0, 0.0, 0.0],   // Bright Red
            [0.0, 1.0, 0.0],   // Bright Green
            [0.0, 0.0, 1.0],   // Bright Blue
            [1.0, 1.0, 0.0],   // Yellow
            [1.0, 0.0, 1.0],   // Magenta
            [0.0, 1.0, 1.0],   // Cyan
            [0.8, 0.4, 0.0],   // Orange
            [0.5, 0.0, 0.5],   // Purple
            [0.0, 0.5, 0.5],   // Teal
            [0.7, 0.3, 0.3]    // Salmon
        ];

        // Randomly select a color from the palette
        const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        
        const colors = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
            colors[i * 3] = color[0];     // Red
            colors[i * 3 + 1] = color[1]; // Green
            colors[i * 3 + 2] = color[2]; // Blue
        }
        return colors;
    }
}