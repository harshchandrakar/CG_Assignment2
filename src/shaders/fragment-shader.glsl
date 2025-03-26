precision mediump float;

varying vec3 fragColor;

void main() {
    // Main face color
    vec3 mainColor = fragColor;
    
    // Darken the edges slightly
    vec3 outlineColor = vec3(0.0, 0.0, 0.0);
    
    // Blend between main color and outline based on position
    gl_FragColor = vec4(mix(mainColor, outlineColor, 0.1), 1.0);
}