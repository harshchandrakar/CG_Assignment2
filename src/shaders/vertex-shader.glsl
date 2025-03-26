attribute vec3 vertPosition;
attribute vec3 vertColor;

uniform mat4 mWorld;
uniform mat4 mView;
uniform mat4 mProj;

varying vec3 fragColor;

void main() {
    // Slightly expand the vertex along its normal for outline effect
    vec3 expandedPosition = vertPosition * 1.02;
    
    // Transform the vertex
    gl_Position = mProj * mView * mWorld * vec4(expandedPosition, 1.0);
    
    // Pass color to fragment shader
    fragColor = vertColor;
}