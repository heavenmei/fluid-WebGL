"use strict";

/**
 * Main
 */
class Main {
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

    // * start the update loop
    // var lastTime = 0;
    // var update = function (currentTime) {
    //   var deltaTime = currentTime - lastTime || 0;
    //   lastTime = currentTime;

    //   this.update(deltaTime);

    //   requestAnimationFrame(update);
    // }.bind(this);
    // update();
    this.onResize();
  }

  draw() {
    var wgl = this.wgl;

    /** Draw triangle */
    var positions = [10, 20, 80, 20, 10, 30, 10, 30, 80, 20, 80, 30];
    // // const positions = [0, 0, 0, 1, 1, 1];

    var positionBuffer = wgl.createBuffer();
    wgl.bufferData(
      positionBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array(positions),
      wgl.STATIC_DRAW
    );

    var transferToGridDrawState = wgl
      .createDrawState()
      .bindFramebuffer(null)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .vertexAttribPointer(
        positionBuffer,
        this.testProgram.getAttribLocation("a_position"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .useProgram(this.testProgram)
      .uniform2f("u_resolution", this.canvas.width, this.canvas.height)
      .uniform4f("u_color", 1, 0, 0.5, 1);

    wgl.drawArrays(transferToGridDrawState, wgl.TRIANGLES, 0, 6);
  }

  drawBackground() {
    var wgl = this.wgl;

    // 创建纹理
    var texture = wgl.createTexture();

    // 设置参数，让我们可以绘制任何尺寸的图像
    wgl.setTextureFiltering(
      wgl.TEXTURE_2D,
      texture,
      wgl.CLAMP_TO_EDGE,
      wgl.CLAMP_TO_EDGE,
      wgl.NEAREST,
      wgl.NEAREST
    );

    // 加载的图片
    wgl.texImage2D(
      wgl.TEXTURE_2D,
      texture,
      0,
      wgl.RGBA,
      wgl.RGBA,
      wgl.UNSIGNED_BYTE,
      this.image
    );

    var positionBuffer = wgl.createBuffer();
    var x1 = 0;
    var x2 = this.image.width / 3;
    var y1 = 0;
    var y2 = this.image.height / 3;
    wgl.bufferData(
      positionBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]),
      wgl.STATIC_DRAW
    );

    // 给矩形提供纹理坐标
    var texCoordBuffer = wgl.createBuffer();
    wgl.bufferData(
      texCoordBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array([
        0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0,
      ]),
      wgl.STATIC_DRAW
    );

    var transferToGridDrawState = wgl
      .createDrawState()
      .bindFramebuffer(null)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .vertexAttribPointer(
        positionBuffer,
        this.backgroundProgram.getAttribLocation("a_position"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribPointer(
        texCoordBuffer,
        this.backgroundProgram.getAttribLocation("a_texCoord"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .useProgram(this.backgroundProgram)
      .uniformTexture("u_image", 0, wgl.TEXTURE_2D, texture)
      .uniform2f("u_resolution", this.canvas.width, this.canvas.height);

    wgl.drawArrays(transferToGridDrawState, wgl.TRIANGLES, 0, 6);
  }

  update() {
    this.drawBackground();
    this.draw();
  }

  onResize(event) {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.update();
  }
}
