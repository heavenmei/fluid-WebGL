"use strict";

class Test {
  translation = [0, 0];
  angle = 0;
  scale = [1, 1];

  constructor(image) {
    this.image = image;

    var canvas = (this.canvas = document.getElementById("canvas"));
    var wgl = (this.wgl = new WrappedGL(canvas));
    wgl ? console.log("=== WebGL init", wgl) : alert("WebGL not supported");

    window.wgl = wgl;

    this.loadPrograms();

    window.addEventListener("resize", this.onResize.bind(this));

    this.positionBuffer = wgl.createBuffer();
    this.initUI();
  }

  async loadPrograms() {
    const programs = await this.wgl.createProgramsFromFiles({
      twoDProgram: {
        vertexShader: "shaders-test/2d.vert",
        fragmentShader: "shaders-test/2d.frag",
        // attributeLocations: { a_position: 0 },
      },
      imageProgram: {
        vertexShader: "shaders-test/image.vert",
        fragmentShader: "shaders-test/image.frag",
      },
      textureProgram: {
        vertexShader: "shaders-test/texture.vert",
        fragmentShader: "shaders-test/texture.frag",
      },
    });
    for (let programName in programs) {
      this[programName] = programs[programName];
    }

    this.start();
  }
  initUI() {
    document.getElementById("text-ui").style.display = "block";
    this.xSlider = new Slider(
      document.getElementById("x-slider"),
      this.x,
      1,
      100,
      function (value) {
        this.translation = [value, this.translation[1]];
        this.update();
      }.bind(this)
    );

    this.ySlider = new Slider(
      document.getElementById("y-slider"),
      this.x,
      1,
      100,
      function (value) {
        this.translation = [this.translation[0], value];
        this.update();
      }.bind(this)
    );

    this.aSlider = new Slider(
      document.getElementById("a-slider"),
      this.x,
      0,
      360,
      function (value) {
        this.angle = value;
        this.update();
      }.bind(this)
    );

    this.scaleXSlider = new Slider(
      document.getElementById("scaleX-slider"),
      this.x,
      1,
      10,
      function (value) {
        this.scale = [value, this.scale[1]];
        this.update();
      }.bind(this)
    );

    this.scaleYSlider = new Slider(
      document.getElementById("scaleY-slider"),
      this.x,
      1,
      100,
      function (value) {
        this.scale = [this.scale[0], value];
        this.update();
      }.bind(this)
    );
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

    var width = 100;
    var height = 30;
    var positions = setRectangle(0, 0, width, height);

    console.log("positions===", positions);

    wgl.bufferData(
      this.positionBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array(positions),
      wgl.STATIC_DRAW
    );

    var transferToGridDrawState = wgl
      .createDrawState()
      .bindFramebuffer(null)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .vertexAttribPointer(
        this.positionBuffer,
        this.twoDProgram.getAttribLocation("a_position"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .useProgram(this.twoDProgram)
      .uniform2fv("u_translation", this.translation)
      .uniform2f("u_resolution", this.canvas.width, this.canvas.height)
      .uniform2fv("u_rotation", printSineAndCosineForAnAngle(this.angle))
      .uniform2fv("u_scale", this.scale)
      .uniform4f("u_color", 1, 0, 0.5, 1);

    wgl.drawArrays(transferToGridDrawState, wgl.TRIANGLES, 0, 6);
  }

  drawImage() {
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
      0,
      wgl.RGBA,
      wgl.RGBA,
      wgl.UNSIGNED_BYTE,
      this.image
    );

    var positionBuffer = wgl.createBuffer();
    var x1 = 1000;
    var x2 = this.image.width / 3;
    var y1 = 500;
    var y2 = this.image.height / 3 + y1;
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
        this.imageProgram.getAttribLocation("a_position"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribPointer(
        texCoordBuffer,
        this.imageProgram.getAttribLocation("a_texCoord"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .useProgram(this.imageProgram)
      .uniformTexture("u_image", 0, wgl.TEXTURE_2D, texture)
      .uniform2f("u_resolution", this.canvas.width, this.canvas.height);

    wgl.drawArrays(transferToGridDrawState, wgl.TRIANGLES, 0, 6);
  }

  drawTexture() {
    let wgl = this.wgl;

    // 创建纹理
    function createAndSetupTexture(wgl) {
      let texture = wgl.createTexture();
      wgl.setTextureFiltering(
        wgl.TEXTURE_2D,
        texture,
        wgl.CLAMP_TO_EDGE,
        wgl.CLAMP_TO_EDGE,
        wgl.NEAREST,
        wgl.NEAREST
      );
      return texture;
    }

    // Create a texture and put the image in it.
    var originalImageTexture = createAndSetupTexture(wgl);
    wgl.texImage2D(
      wgl.TEXTURE_2D,
      0,
      wgl.RGBA,
      wgl.RGBA,
      wgl.UNSIGNED_BYTE,
      this.image
    );

    // 创建两个纹理绑定到帧缓冲
    var textures = [];
    var framebuffers = [];
    for (var ii = 0; ii < 2; ++ii) {
      var texture = createAndSetupTexture(wgl);
      textures.push(texture);

      // 设置纹理大小和图像大小一致
      wgl.texImage2D(
        wgl.TEXTURE_2D,
        0,
        wgl.RGBA,
        this.image.width,
        this.image.height,
        0,
        wgl.RGBA,
        wgl.UNSIGNED_BYTE,
        null
      );

      // 创建一个帧缓冲
      var fbo = wgl.createFramebuffer();
      framebuffers.push(fbo);

      // 绑定纹理到帧缓冲
      wgl.framebufferTexture2D(
        fbo,
        wgl.FRAMEBUFFER,
        wgl.COLOR_ATTACHMENT0,
        wgl.TEXTURE_2D,
        texture,
        0
      );
    }

    // 定义一些卷积核
    var kernels = {
      normal: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      gaussianBlur: [
        0.045, 0.122, 0.045, 0.122, 0.332, 0.122, 0.045, 0.122, 0.045,
      ],
      unsharpen: [-1, -1, -1, -1, 9, -1, -1, -1, -1],
      emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
    };

    // 将要使用的效果列表
    var effectsToApply = [
      "gaussianBlur",
      "emboss",
      "gaussianBlur",
      "unsharpen",
    ];

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

    var imagesDrawState = wgl
      .createDrawState()
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .vertexAttribPointer(
        positionBuffer,
        this.imageProgram.getAttribLocation("a_position"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribPointer(
        texCoordBuffer,
        this.imageProgram.getAttribLocation("a_texCoord"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .useProgram(this.textureProgram)
      .uniform2f("u_textureSize", this.image.width, this.image.height)
      .bindTexture(0, wgl.TEXTURE_2D, originalImageTexture)
      .uniform1f("u_flipY", 1);

    // 循环施加每一种渲染效果
    // for (var ii = 0; ii < effectsToApply.length; ++ii) {
    // 使用两个帧缓冲中的一个
    setFramebuffer(framebuffers[0], this.image.width, this.image.height);

    drawWithKernel(effectsToApply[3]);

    // // 下次绘制时使用刚才的渲染结果
    imagesDrawState.bindTexture(1, wgl.TEXTURE_2D, textures[0]);
    // }

    // 最后将结果绘制到画布  需要绕y轴翻转
    imagesDrawState.uniform1f("u_flipY", -1);
    setFramebuffer(null, this.canvas.width, this.canvas.height);
    drawWithKernel("normal");
    // drawWithKernel("unsharpen");

    function setFramebuffer(fbo, width, height) {
      imagesDrawState
        .bindFramebuffer(fbo)
        .uniform2f("u_resolution", width, height)
        .viewport(0, 0, width, height);
    }

    function computeKernelWeight(kernel) {
      var weight = kernel.reduce(function (prev, curr) {
        return prev + curr;
      });
      return weight <= 0 ? 1 : weight;
    }

    function drawWithKernel(name) {
      // 设置卷积核
      imagesDrawState
        .uniform1fv("u_kernel[0]", kernels[name])
        .uniform1f("u_kernelWeight", computeKernelWeight(kernels[name]));
      console.log("drawWithKernel", imagesDrawState);

      // 画出矩形
      wgl.drawArrays(imagesDrawState, wgl.TRIANGLES, 0, 6);
    }
  }

  update() {
    this.draw();
    // this.drawImage();
    // this.drawTexture();
    this.redrawUI();
  }

  onResize(event) {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.update();
  }

  redrawUI() {
    this.xSlider.redraw();
    this.ySlider.redraw();
    this.aSlider.redraw();
    this.scaleXSlider.redraw();
    this.scaleYSlider.redraw();
  }
}

// Fill the buffer with the values that define a rectangle.
function setRectangle(x, y, width, height) {
  var x1 = x;
  var x2 = x + width;
  var y1 = y;
  var y2 = y + height;
  return new Float32Array([x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]);
}

function printSineAndCosineForAnAngle(angleInDegrees) {
  let rotation = [0, 1];
  var angleInRadians = ((360 - angleInDegrees) * Math.PI) / 180;
  rotation[0] = Math.sin(angleInRadians);
  rotation[1] = Math.cos(angleInRadians);
  return rotation;
}
