precision highp float;

varying vec2 v_coordinates;

uniform sampler2D u_input;

void main() {
    vec3 rgbA = (texture2D(u_input, v_coordinates.xy).xyz);
    gl_FragColor = vec4(rgbA, 1.0);
}
