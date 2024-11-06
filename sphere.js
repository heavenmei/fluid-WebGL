"use strict";

class Sphere {
  constructor() {
    var canvas = (this.canvas = document.getElementById("canvas"));
    var wgl = (this.wgl = new WrappedGL(canvas));
    wgl ? console.log("=== WebGL init", wgl) : alert("WebGL not supported");
    window.wgl = wgl;

    this.loadPrograms();
    window.addEventListener("resize", this.onResize.bind(this));

    // calc position, normal, texcoord, and vertex color
    let vertices = primitives.createSphereVertices(10, 12, 6);
    vertices = primitives.deindexVertices(vertices);
    primitives.makeRandomVertexColors(vertices, {
      vertsPerColor: 6,
      rand: function (ndx, channel) {
        return channel < 3 ? (128 + Math.random() * 128) | 0 : 255;
      },
    });

    this.numElements =
      vertices.position.length / vertices.position.numComponents;

    // create buffers
    this.positionBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.positionBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array(vertices.position),
      wgl.STATIC_DRAW
    );

    this.colorBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.colorBuffer,
      wgl.ARRAY_BUFFER,
      new Uint8Array(vertices.color),
      wgl.STATIC_DRAW
    );
    console.log("=== Sphere", vertices);
  }

  async loadPrograms() {
    const programs = await this.wgl.createProgramsFromFiles({
      sphereProgram: {
        vertexShader: "shaders-test/sphere.vert",
        fragmentShader: "shaders-test/sphere.frag",
      },
    });
    for (let programName in programs) {
      this[programName] = programs[programName];
    }

    this.onResize();
    requestAnimationFrame(this.update.bind(this));
  }

  draw(time) {
    time *= 0.0005;

    let wgl = this.wgl;

    // Compute the projection matrix
    var fieldOfViewRadians = degToRad(60);
    var aspect = this.canvas.width / this.canvas.height;
    var projectionMatrix = m4.perspective(fieldOfViewRadians, aspect, 1, 2000);

    // Compute the camera's matrix using look at.
    var cameraPosition = [0, 0, 100];
    var target = [0, 0, 0];
    var up = [0, 1, 0];
    var cameraMatrix = m4.lookAt(cameraPosition, target, up);

    // Make a view matrix from the camera matrix.
    var viewMatrix = m4.inverse(cameraMatrix);

    var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);
    var sphereXRotation = time;
    var sphereYRotation = time;
    const u_matrix = computeMatrix(
      viewProjectionMatrix,
      [0, 0, 0],
      sphereXRotation,
      sphereYRotation
    );

    wgl.clear(
      wgl.createClearState().bindFramebuffer(null),
      wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT
    );

    var sphereDrawState = wgl
      .createDrawState()
      .bindFramebuffer(null)
      .viewport(0, 0, this.canvas.width, this.canvas.height)
      .enable(wgl.DEPTH_TEST)
      .enable(wgl.CULL_FACE)

      .useProgram(this.sphereProgram)

      .vertexAttribPointer(
        this.positionBuffer,
        this.sphereProgram.getAttribLocation("a_position"),
        3,
        wgl.FLOAT,
        false,
        0,
        0
      )
      .vertexAttribPointer(
        this.colorBuffer,
        this.sphereProgram.getAttribLocation("a_color"),
        4,
        wgl.UNSIGNED_BYTE,
        true,
        0,
        0
      )
      // .uniform4fv("u_colorMult", [0.5, 1, 0.5, 1])
      .uniformMatrix4fv("u_matrix", false, u_matrix);

    wgl.drawArrays(sphereDrawState, wgl.TRIANGLES, 0, this.numElements);

    requestAnimationFrame(this.draw.bind(this));
  }

  update(time) {
    this.draw(time);
    this.redrawUI();
  }

  onResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  redrawUI() {}
}

function degToRad(d) {
  return (d * Math.PI) / 180;
}

function computeMatrix(
  viewProjectionMatrix,
  translation,
  xRotation,
  yRotation
) {
  var matrix = m4.translate(
    viewProjectionMatrix,
    translation[0],
    translation[1],
    translation[2]
  );
  matrix = m4.xRotate(matrix, xRotation);
  return m4.yRotate(matrix, yRotation);
}
