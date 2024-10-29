const SHADOW_MAP_WIDTH = 256;
const SHADOW_MAP_HEIGHT = 256;

class Renderer {
  particlesWidth = 0;
  particlesHeight = 0;
  sphereRadius = 0.0;

  //mouse position is in [-1, 1]
  mouseX = 0;
  mouseY = 0;

  //the mouse plane is a plane centered at the camera orbit point and orthogonal to the view direction
  lastMousePlaneX = 0;
  lastMousePlaneY = 0;

  isLog = false;

  constructor(
    canvas,
    wgl,
    projectionMatrix,
    camera,
    gridDimensions,
    boxEditor,
    image,
    onLoaded
  ) {
    this.canvas = canvas;
    this.wgl = wgl;
    this.projectionMatrix = projectionMatrix;
    this.camera = camera;
    this.boxEditor = boxEditor;
    this.image = image;

    this.wgl.getExtension("OES_texture_float");
    this.wgl.getExtension("OES_texture_float_linear");
    this.wgl.getExtension("ANGLE_instanced_arrays");
    this.depthExt = this.wgl.getExtension("WEBGL_depth_texture");

    this.quadVertexBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.quadVertexBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array([-1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]),
      wgl.STATIC_DRAW
    );

    // * create stuff for rendering

    var sphereGeometry = (this.sphereGeometry = generateSphereGeometry(3));
    console.log("sphereGeometry", sphereGeometry);

    this.sphereVertexBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.sphereVertexBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array(sphereGeometry.vertices),
      wgl.STATIC_DRAW
    );

    this.sphereNormalBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.sphereNormalBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array(sphereGeometry.normals),
      wgl.STATIC_DRAW
    );

    this.sphereIndexBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.sphereIndexBuffer,
      wgl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(sphereGeometry.indices),
      wgl.STATIC_DRAW
    );

    this.depthFramebuffer = wgl.createFramebuffer();
    this.depthColorTexture = wgl.buildTexture(
      wgl.RGBA,
      wgl.UNSIGNED_BYTE,
      SHADOW_MAP_WIDTH,
      SHADOW_MAP_HEIGHT,
      null,
      wgl.CLAMP_TO_EDGE,
      wgl.CLAMP_TO_EDGE,
      wgl.LINEAR,
      wgl.LINEAR
    );
    this.depthTexture = wgl.buildTexture(
      wgl.DEPTH_COMPONENT,
      wgl.UNSIGNED_SHORT,
      SHADOW_MAP_WIDTH,
      SHADOW_MAP_HEIGHT,
      null,
      wgl.CLAMP_TO_EDGE,
      wgl.CLAMP_TO_EDGE,
      wgl.LINEAR,
      wgl.LINEAR
    );

    //we light directly from above
    this.lightViewMatrix = new Float32Array(16);
    var midpoint = [
      gridDimensions[0] / 2,
      gridDimensions[1] / 2,
      gridDimensions[2] / 2,
    ];
    Utilities.makeLookAtMatrix(
      this.lightViewMatrix,
      midpoint,
      [midpoint[0], midpoint[1] - 1.0, midpoint[2]],
      [0.0, 0.0, 1.0]
    );
    this.lightProjectionMatrix = Utilities.makeOrthographicMatrix(
      new Float32Array(16),
      -gridDimensions[0] / 2,
      gridDimensions[0] / 2,
      -gridDimensions[2] / 2,
      gridDimensions[2] / 2,
      -gridDimensions[1] / 2,
      gridDimensions[1] / 2
    );
    this.lightProjectionViewMatrix = new Float32Array(16);
    Utilities.premultiplyMatrix(
      this.lightProjectionViewMatrix,
      this.lightViewMatrix,
      this.lightProjectionMatrix
    );

    this.particleVertexBuffer = wgl.createBuffer();

    this.renderingFramebuffer = wgl.createFramebuffer();
    this.renderingRenderbuffer = wgl.createRenderbuffer();
    this.renderingTexture = wgl.createTexture();
    this.occlusionTexture = wgl.createTexture();
    this.compositingTexture = wgl.createTexture();

    this.loadPrograms(onLoaded);
  }

  async loadPrograms(onLoaded) {
    const programs = await this.wgl.createProgramsFromFiles({
      sphereProgram: {
        vertexShader: "shaders/sphere.vert",
        fragmentShader: "shaders/sphere.frag",
      },
      sphereDepthProgram: {
        vertexShader: "shaders/spheredepth.vert",
        fragmentShader: "shaders/spheredepth.frag",
      },
      sphereAOProgram: {
        vertexShader: "shaders/sphereao.vert",
        fragmentShader: "shaders/sphereao.frag",
      },
      compositeProgram: {
        vertexShader: "shaders/fullscreen.vert",
        fragmentShader: "shaders/composite.frag",
        attributeLocations: { a_position: 0 },
      },
      fxaaProgram: {
        vertexShader: "shaders/fullscreen.vert",
        fragmentShader: "shaders/fxaa.frag",
        attributeLocations: { a_position: 0 },
      },
    });

    for (let programName in programs) {
      this[programName] = programs[programName];
    }

    this.simulator = new Simulator(this.wgl, this.image, function () {
      onLoaded();
    });
  }

  onMouseMove(event) {
    var position = Utilities.getMousePosition(event, this.canvas);
    var normalizedX = position.x / this.canvas.width;
    var normalizedY = position.y / this.canvas.height;

    this.mouseX = normalizedX * 2.0 - 1.0;
    this.mouseY = (1.0 - normalizedY) * 2.0 - 1.0;

    this.camera.onMouseMove(event);
  }

  onMouseDown(event) {
    this.camera.onMouseDown(event);
  }

  onMouseUp(event) {
    this.camera.onMouseUp(event);
  }

  onResize() {
    console.log("Renderer ===  resize");

    wgl.renderbufferStorage(
      this.renderingRenderbuffer,
      wgl.RENDERBUFFER,
      wgl.DEPTH_COMPONENT16,
      this.canvas.width,
      this.canvas.height
    );
    wgl.rebuildTexture(
      this.renderingTexture,
      wgl.RGBA,
      wgl.FLOAT,
      this.canvas.width,
      this.canvas.height,
      null,
      wgl.CLAMP_TO_EDGE,
      wgl.CLAMP_TO_EDGE,
      wgl.LINEAR,
      wgl.LINEAR
    ); //contains (normal.x, normal.y, speed, depth)

    wgl.rebuildTexture(
      this.occlusionTexture,
      wgl.RGBA,
      wgl.UNSIGNED_BYTE,
      this.canvas.width,
      this.canvas.height,
      null,
      wgl.CLAMP_TO_EDGE,
      wgl.CLAMP_TO_EDGE,
      wgl.LINEAR,
      wgl.LINEAR
    );

    wgl.rebuildTexture(
      this.compositingTexture,
      wgl.RGBA,
      wgl.UNSIGNED_BYTE,
      this.canvas.width,
      this.canvas.height,
      null,
      wgl.CLAMP_TO_EDGE,
      wgl.CLAMP_TO_EDGE,
      wgl.LINEAR,
      wgl.LINEAR
    );
  }

  reset(
    particlesWidth,
    particlesHeight,
    particlePositions,
    gridSize,
    gridResolution,
    particleDensity,
    sphereRadius
  ) {
    this.simulator.reset(
      particlesWidth,
      particlesHeight,
      particlePositions,
      gridSize,
      gridResolution,
      particleDensity
    );

    this.particlesWidth = particlesWidth;
    this.particlesHeight = particlesHeight;

    this.sphereRadius = sphereRadius;

    ///////////////////////////////////////////////////////////
    // create particle data

    var particleCount = this.particlesWidth * this.particlesHeight;

    //fill particle vertex buffer containing the relevant texture coordinates
    var particleTextureCoordinates = new Float32Array(
      this.particlesWidth * this.particlesHeight * 2
    );
    for (var y = 0; y < this.particlesHeight; ++y) {
      for (var x = 0; x < this.particlesWidth; ++x) {
        particleTextureCoordinates[(y * this.particlesWidth + x) * 2] =
          (x + 0.5) / this.particlesWidth;
        particleTextureCoordinates[(y * this.particlesWidth + x) * 2 + 1] =
          (y + 0.5) / this.particlesHeight;
      }
    }

    wgl.bufferData(
      this.particleVertexBuffer,
      wgl.ARRAY_BUFFER,
      particleTextureCoordinates,
      wgl.STATIC_DRAW
    );
  }

  /**
   * 画一个球体, draw rendering data (normal, speed, depth)
   * @param {*} projectionMatrix - 投影矩阵
   * @param {*} viewMatrix - 视图矩阵
   */
  drawSphere(projectionMatrix, viewMatrix) {
    let wgl = this.wgl;

    wgl.framebufferTexture2D(
      this.renderingFramebuffer,
      wgl.FRAMEBUFFER,
      wgl.COLOR_ATTACHMENT0,
      wgl.TEXTURE_2D,
      this.renderingTexture,
      0
    );
    wgl.framebufferRenderbuffer(
      this.renderingFramebuffer,
      wgl.FRAMEBUFFER,
      wgl.DEPTH_ATTACHMENT,
      wgl.RENDERBUFFER,
      this.renderingRenderbuffer
    );

    wgl.clear(
      wgl
        .createClearState()
        .bindFramebuffer(this.renderingFramebuffer)
        .clearColor(-99999.0, -99999.0, -99999.0, -99999.0),
      // .clearColor(0,0,0,0),
      wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT
    );

    var sphereDrawState = wgl
      .createDrawState()
      .bindFramebuffer(this.renderingFramebuffer)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .enable(wgl.DEPTH_TEST)
      .enable(wgl.CULL_FACE)

      .useProgram(this.sphereProgram)

      .vertexAttribPointer(
        this.sphereVertexBuffer,
        this.sphereProgram.getAttribLocation("a_vertexPosition"),
        3,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribPointer(
        this.sphereNormalBuffer,
        this.sphereProgram.getAttribLocation("a_vertexNormal"),
        3,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .vertexAttribPointer(
        this.particleVertexBuffer,
        this.sphereProgram.getAttribLocation("a_textureCoordinates"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribDivisorANGLE(
        this.sphereProgram.getAttribLocation("a_textureCoordinates"),
        1
      )

      .bindIndexBuffer(this.sphereIndexBuffer)

      .uniformMatrix4fv("u_projectionMatrix", false, projectionMatrix)
      .uniformMatrix4fv("u_viewMatrix", false, viewMatrix)

      .uniformTexture(
        "u_positionsTexture",
        0,
        wgl.TEXTURE_2D,
        this.simulator.particlePositionTexture
      )
      .uniformTexture(
        "u_velocitiesTexture",
        1,
        wgl.TEXTURE_2D,
        this.simulator.particleVelocityTexture
      )

      .uniform1f("u_sphereRadius", this.sphereRadius);

    wgl.drawElementsInstancedANGLE(
      sphereDrawState,
      wgl.TRIANGLES,
      this.sphereGeometry.indices.length,
      wgl.UNSIGNED_SHORT,
      0,
      this.particlesWidth * this.particlesHeight
    );
  }

  // 环境光
  drawOcclusion(projectionMatrix, viewMatrix, fov) {
    let wgl = this.wgl;

    wgl.framebufferTexture2D(
      this.renderingFramebuffer,
      wgl.FRAMEBUFFER,
      wgl.COLOR_ATTACHMENT0,
      wgl.TEXTURE_2D,
      this.occlusionTexture,
      0
    );

    wgl.clear(
      wgl
        .createClearState()
        .bindFramebuffer(this.renderingFramebuffer)
        .clearColor(0.0, 0.0, 0.0, 0.0),
      wgl.COLOR_BUFFER_BIT
    );

    var occlusionDrawState = wgl
      .createDrawState()
      .bindFramebuffer(this.renderingFramebuffer)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .enable(wgl.DEPTH_TEST)
      .depthMask(false)

      .enable(wgl.CULL_FACE)

      .enable(wgl.BLEND)
      .blendEquation(wgl.FUNC_ADD)
      .blendFuncSeparate(wgl.ONE, wgl.ONE, wgl.ONE, wgl.ONE)

      .useProgram(this.sphereAOProgram)

      .vertexAttribPointer(
        this.sphereVertexBuffer,
        this.sphereAOProgram.getAttribLocation("a_vertexPosition"),
        3,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribPointer(
        this.particleVertexBuffer,
        this.sphereAOProgram.getAttribLocation("a_textureCoordinates"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribDivisorANGLE(
        this.sphereAOProgram.getAttribLocation("a_textureCoordinates"),
        1
      )

      .bindIndexBuffer(this.sphereIndexBuffer)

      .uniformMatrix4fv("u_projectionMatrix", false, projectionMatrix)
      .uniformMatrix4fv("u_viewMatrix", false, viewMatrix)

      .uniformTexture(
        "u_positionsTexture",
        0,
        wgl.TEXTURE_2D,
        this.simulator.particlePositionTexture
      )
      .uniformTexture(
        "u_velocitiesTexture",
        1,
        wgl.TEXTURE_2D,
        this.simulator.particleVelocityTexture
      )

      .uniformTexture(
        "u_renderingTexture",
        2,
        wgl.TEXTURE_2D,
        this.renderingTexture
      )
      .uniform2f("u_resolution", this.canvas.width, this.canvas.height)
      .uniform1f("u_fov", fov)

      .uniform1f("u_sphereRadius", this.sphereRadius);

    wgl.drawElementsInstancedANGLE(
      occlusionDrawState,
      wgl.TRIANGLES,
      this.sphereGeometry.indices.length,
      wgl.UNSIGNED_SHORT,
      0,
      this.particlesWidth * this.particlesHeight
    );
  }

  drawDepthMap() {
    let wgl = this.wgl;

    wgl.framebufferTexture2D(
      this.depthFramebuffer,
      wgl.FRAMEBUFFER,
      wgl.COLOR_ATTACHMENT0,
      wgl.TEXTURE_2D,
      this.depthColorTexture,
      0
    );
    wgl.framebufferTexture2D(
      this.depthFramebuffer,
      wgl.FRAMEBUFFER,
      wgl.DEPTH_ATTACHMENT,
      wgl.TEXTURE_2D,
      this.depthTexture,
      0
    );

    wgl.clear(
      wgl
        .createClearState()
        .bindFramebuffer(this.depthFramebuffer)
        .clearColor(0, 0, 0, 0),
      wgl.DEPTH_BUFFER_BIT
    );

    var depthDrawState = wgl
      .createDrawState()
      .bindFramebuffer(this.depthFramebuffer)
      .viewport(0, 0, SHADOW_MAP_WIDTH, SHADOW_MAP_HEIGHT)

      .enable(wgl.DEPTH_TEST)
      .depthMask(true)

      //so no occlusion past end of shadow map (with clamp to edge)
      .enable(wgl.SCISSOR_TEST)
      .scissor(1, 1, SHADOW_MAP_WIDTH - 2, SHADOW_MAP_HEIGHT - 2)

      .colorMask(false, false, false, false)

      .enable(wgl.CULL_FACE)

      .useProgram(this.sphereDepthProgram)

      .vertexAttribPointer(
        this.sphereVertexBuffer,
        this.sphereDepthProgram.getAttribLocation("a_vertexPosition"),
        3,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribPointer(
        this.particleVertexBuffer,
        this.sphereDepthProgram.getAttribLocation("a_textureCoordinates"),
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )
      .vertexAttribDivisorANGLE(
        this.sphereDepthProgram.getAttribLocation("a_textureCoordinates"),
        1
      )

      .bindIndexBuffer(this.sphereIndexBuffer)

      .uniformMatrix4fv(
        "u_projectionViewMatrix",
        false,
        this.lightProjectionViewMatrix
      )

      .uniformTexture(
        "u_positionsTexture",
        0,
        wgl.TEXTURE_2D,
        this.simulator.particlePositionTexture
      )
      .uniformTexture(
        "u_velocitiesTexture",
        1,
        wgl.TEXTURE_2D,
        this.simulator.particleVelocityTexture
      )

      .uniform1f("u_sphereRadius", this.sphereRadius);

    wgl.drawElementsInstancedANGLE(
      depthDrawState,
      wgl.TRIANGLES,
      this.sphereGeometry.indices.length,
      wgl.UNSIGNED_SHORT,
      0,
      this.particlesWidth * this.particlesHeight
    );
  }

  // 合成
  drawComposite(viewMatrix, fov) {
    let wgl = this.wgl;

    var inverseViewMatrix = Utilities.invertMatrix(
      new Float32Array(16),
      viewMatrix
    );

    wgl.framebufferTexture2D(
      this.renderingFramebuffer,
      wgl.FRAMEBUFFER,
      wgl.COLOR_ATTACHMENT0,
      wgl.TEXTURE_2D,
      this.compositingTexture,
      0
    );

    // wgl.clear(
    //   wgl
    //     .createClearState()
    //     .bindFramebuffer(this.renderingFramebuffer)
    //     .clearColor(0, 0, 0, 0),
    //   wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT
    // );

    var compositeDrawState = wgl
      .createDrawState()
      .bindFramebuffer(this.renderingFramebuffer)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .useProgram(this.compositeProgram)

      .vertexAttribPointer(
        this.quadVertexBuffer,
        0,
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .uniformTexture(
        "u_renderingTexture",
        0,
        wgl.TEXTURE_2D,
        this.renderingTexture
      )
      .uniformTexture(
        "u_occlusionTexture",
        1,
        wgl.TEXTURE_2D,
        this.occlusionTexture
      )
      .uniform2f("u_resolution", this.canvas.width, this.canvas.height)
      .uniform1f("u_fov", fov)

      .uniformMatrix4fv("u_inverseViewMatrix", false, inverseViewMatrix)

      .uniformTexture(
        "u_shadowDepthTexture",
        2,
        wgl.TEXTURE_2D,
        this.depthTexture
      )
      .uniform2f("u_shadowResolution", SHADOW_MAP_WIDTH, SHADOW_MAP_HEIGHT)
      .uniformMatrix4fv(
        "u_lightProjectionViewMatrix",
        false,
        this.lightProjectionViewMatrix
      );

    wgl.drawArrays(compositeDrawState, wgl.TRIANGLE_STRIP, 0, 4);
  }

  // 快速近似抗锯齿（FXAA）
  drawFXAA() {
    let wgl = this.wgl;

    // wgl.clear(
    //   wgl.createClearState().bindFramebuffer(null).clearColor(0, 0, 0, 0),
    //   wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT
    // );

    var fxaaDrawState = wgl
      .createDrawState()
      .bindFramebuffer(null)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .useProgram(this.fxaaProgram)

      .vertexAttribPointer(
        this.quadVertexBuffer,
        0,
        2,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .uniformTexture("u_input", 0, wgl.TEXTURE_2D, this.compositingTexture)
      .uniform2f("u_resolution", this.canvas.width, this.canvas.height);

    wgl.drawArrays(fxaaDrawState, wgl.TRIANGLE_STRIP, 0, 4);
  }

  draw() {
    const projectionMatrix = this.projectionMatrix;
    const viewMatrix = this.camera.getViewMatrix();
    const fov = 2.0 * Math.atan(1.0 / projectionMatrix[5]);

    if (!this.isLog) {
      console.log(
        "Renderer === draw: size 16",
        projectionMatrix,
        viewMatrix,
        fov
      );
      this.isLog = true;
    }
    this.drawSphere(projectionMatrix, viewMatrix);
    this.drawOcclusion(projectionMatrix, viewMatrix, fov);
    // this.drawDepthMap();
    this.drawComposite(viewMatrix, fov);
    this.drawFXAA();
    this.boxEditor.drawGrid();
  }

  update(timeStep) {
    var fov = 2.0 * Math.atan(1.0 / this.projectionMatrix[5]);

    var viewSpaceMouseRay = [
      this.mouseX *
        Math.tan(fov / 2.0) *
        (this.canvas.width / this.canvas.height),
      this.mouseY * Math.tan(fov / 2.0),
      -1.0,
    ];

    var mousePlaneX = viewSpaceMouseRay[0] * this.camera.distance;
    var mousePlaneY = viewSpaceMouseRay[1] * this.camera.distance;

    var mouseVelocityX = mousePlaneX - this.lastMousePlaneX;
    var mouseVelocityY = mousePlaneY - this.lastMousePlaneY;

    if (this.camera.isMouseDown()) {
      mouseVelocityX = 0.0;
      mouseVelocityY = 0.0;
    }

    this.lastMousePlaneX = mousePlaneX;
    this.lastMousePlaneY = mousePlaneY;

    var inverseViewMatrix = Utilities.invertMatrix(
      [],
      this.camera.getViewMatrix()
    );
    var worldSpaceMouseRay = Utilities.transformDirectionByMatrix(
      [],
      viewSpaceMouseRay,
      inverseViewMatrix
    );
    Utilities.normalizeVector(worldSpaceMouseRay, worldSpaceMouseRay);

    var cameraViewMatrix = this.camera.getViewMatrix();
    var cameraRight = [
      cameraViewMatrix[0],
      cameraViewMatrix[4],
      cameraViewMatrix[8],
    ];
    var cameraUp = [
      cameraViewMatrix[1],
      cameraViewMatrix[5],
      cameraViewMatrix[9],
    ];

    var mouseVelocity = [];
    for (var i = 0; i < 3; ++i) {
      mouseVelocity[i] =
        mouseVelocityX * cameraRight[i] + mouseVelocityY * cameraUp[i];
    }

    this.simulator.simulate(
      timeStep,
      mouseVelocity,
      this.camera.getPosition(),
      worldSpaceMouseRay
    );
    this.draw();
  }
}

/**
 *  we render in a deferred way to a special RGBA texture format
    the format is (normal.x, normal.y, speed, depth)
    the normal is normalized (thus z can be reconstructed with sqrt(1.0 - x * x - y * y)
    the depth simply the z in view space
 * @param {number} iterations
 * @returns {vertices, normals, indices}
 */
function generateSphereGeometry(iterations) {
  var vertices = [],
    normals = [];

  var compareVectors = function (a, b) {
    var EPSILON = 0.001;
    return (
      Math.abs(a[0] - b[0]) < EPSILON &&
      Math.abs(a[1] - b[1]) < EPSILON &&
      Math.abs(a[2] - b[2]) < EPSILON
    );
  };

  var addVertex = function (v) {
    Utilities.normalizeVector(v, v);
    vertices.push(v);
    normals.push(v);
  };

  var getMiddlePoint = function (vertexA, vertexB) {
    var middle = [
      (vertexA[0] + vertexB[0]) / 2.0,
      (vertexA[1] + vertexB[1]) / 2.0,
      (vertexA[2] + vertexB[2]) / 2.0,
    ];

    Utilities.normalizeVector(middle, middle);

    for (var i = 0; i < vertices.length; ++i) {
      if (compareVectors(vertices[i], middle)) {
        return i;
      }
    }

    addVertex(middle);
    return vertices.length - 1;
  };

  var t = (1.0 + Math.sqrt(5.0)) / 2.0;

  addVertex([-1, t, 0]);
  addVertex([1, t, 0]);
  addVertex([-1, -t, 0]);
  addVertex([1, -t, 0]);

  addVertex([0, -1, t]);
  addVertex([0, 1, t]);
  addVertex([0, -1, -t]);
  addVertex([0, 1, -t]);

  addVertex([t, 0, -1]);
  addVertex([t, 0, 1]);
  addVertex([-t, 0, -1]);
  addVertex([-t, 0, 1]);

  var faces = [];
  faces.push([0, 11, 5]);
  faces.push([0, 5, 1]);
  faces.push([0, 1, 7]);
  faces.push([0, 7, 10]);
  faces.push([0, 10, 11]);

  faces.push([1, 5, 9]);
  faces.push([5, 11, 4]);
  faces.push([11, 10, 2]);
  faces.push([10, 7, 6]);
  faces.push([7, 1, 8]);

  faces.push([3, 9, 4]);
  faces.push([3, 4, 2]);
  faces.push([3, 2, 6]);
  faces.push([3, 6, 8]);
  faces.push([3, 8, 9]);

  faces.push([4, 9, 5]);
  faces.push([2, 4, 11]);
  faces.push([6, 2, 10]);
  faces.push([8, 6, 7]);
  faces.push([9, 8, 1]);

  for (var i = 0; i < iterations; ++i) {
    var faces2 = [];

    for (var i = 0; i < faces.length; ++i) {
      var face = faces[i];
      //replace triangle with 4 triangles
      var a = getMiddlePoint(vertices[face[0]], vertices[face[1]]);
      var b = getMiddlePoint(vertices[face[1]], vertices[face[2]]);
      var c = getMiddlePoint(vertices[face[2]], vertices[face[0]]);

      faces2.push([face[0], a, c]);
      faces2.push([face[1], b, a]);
      faces2.push([face[2], c, b]);
      faces2.push([a, b, c]);
    }

    faces = faces2;
  }

  var packedVertices = [],
    packedNormals = [],
    indices = [];

  for (var i = 0; i < vertices.length; ++i) {
    packedVertices.push(vertices[i][0]);
    packedVertices.push(vertices[i][1]);
    packedVertices.push(vertices[i][2]);

    packedNormals.push(normals[i][0]);
    packedNormals.push(normals[i][1]);
    packedNormals.push(normals[i][2]);
  }

  for (var i = 0; i < faces.length; ++i) {
    var face = faces[i];
    indices.push(face[0]);
    indices.push(face[1]);
    indices.push(face[2]);
  }

  return {
    vertices: packedVertices,
    normals: packedNormals,
    indices: indices,
  };
}
