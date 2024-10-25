"use strict";

class Fluid {
  constructor(image) {
    this.image = image;

    var canvas = (this.canvas = document.getElementById("canvas"));
    var wgl = (this.wgl = new WrappedGL(canvas));
    wgl ? console.log("=== WebGL init", wgl) : alert("WebGL not supported");

    window.wgl = wgl;

    /** load programs */
    wgl.createProgramsFromFiles(
      {
        testProgram: {
          vertexShader: "shaders-test/2d.vert",
          fragmentShader: "shaders-test/2d.frag",
          // attributeLocations: { a_position: 0 },
        },
        backgroundProgram: {
          vertexShader: "shaders-test/image.vert",
          fragmentShader: "shaders-test/image.frag",
        },
      },
      (programs) => {
        for (let programName in programs) {
          this[programName] = programs[programName];
        }

        // onLoaded();
        this.start();
      }
    );

    /** init */
    // canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    // canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
    // document.addEventListener("mouseup", this.onMouseUp.bind(this));

    // document.addEventListener("keydown", this.onKeyDown.bind(this));
    // document.addEventListener("keyup", this.onKeyUp.bind(this));

    window.addEventListener("resize", this.onResize.bind(this));
  }

  start() {
    var wgl = this.wgl;
    wgl.clear(
      wgl
        .createClearState()
        .bindFramebuffer(null)
        .clearColor(0.9, 0.9, 0.9, 1.0),
      wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT
    );

    this.onResize();
  }

  draw() {}

  update() {
    this.draw();
  }

  onResize(event) {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.update();
  }
}
