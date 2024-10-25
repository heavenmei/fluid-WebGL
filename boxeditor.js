"use strict";

var InteractionMode = {
  RESIZING: 0,
  TRANSLATING: 1,

  DRAWING: 2, //whilst we're drawing a rectangle on a plane
  EXTRUDING: 3, //whilst we're extruding that rectangle into a box
};

var STEP = 1.0;

class AABB {
  constructor(min, max) {
    this.min = [min[0], min[1], min[2]];
    this.max = [max[0], max[1], max[2]];
  }

  computeVolume() {
    var volume = 1;
    for (var i = 0; i < 3; ++i) {
      volume *= this.max[i] - this.min[i];
    }
    return volume;
  }

  computeSurfaceArea() {
    var width = this.max[0] - this.min[0];
    var height = this.max[1] - this.min[1];
    var depth = this.max[2] - this.min[2];

    return 2 * (width * height + width * depth + height * depth);
  }

  //returns new AABB with the same min and max (but not the same array references)
  clone() {
    return new AABB(
      [this.min[0], this.min[1], this.min[2]],
      [this.max[0], this.max[1], this.max[2]]
    );
  }

  randomPoint() {
    //random point in this AABB
    var point = [];
    for (var i = 0; i < 3; ++i) {
      point[i] = this.min[i] + Math.random() * (this.max[i] - this.min[i]);
    }
    return point;
  }
}

class BoxEditor {
  /*
    {
      mode: the interaction mode,
      during resizing or translating or extrusion:
          box: box we're currently manipulating,
          axis: axis of plane we're manipulating: 0, 1 or 2
          side: side of plane we're manipulating: -1 or 1
          point: the point at which the interaction started
      during translation we also have:
          startMax: the starting max along the interaction axis
          startMin: the starting min along the interaction axis
      during drawing
          box: box we're currently drawing
          point: the point at which we started drawing
          axis: the axis of the plane which we're drawing on
          side: the side of the plane which we're drawin on
    }
  */
  interactionState = null;
  boxes = [];
  // maps a key code to whether or not it's pressed
  keyPressed = new Array(256).fill(false);
  mouseX = 9999;
  mouseY = 9999;

  constructor(
    canvas,
    wgl,
    projectionMatrix,
    camera,
    gridSize,
    onLoaded,
    onChange
  ) {
    this.canvas = canvas;
    this.wgl = wgl;
    this.projectionMatrix = projectionMatrix;
    this.camera = camera;

    this.gridWidth = gridSize[0];
    this.gridHeight = gridSize[1];
    this.gridDepth = gridSize[2];
    this.gridDimensions = [this.gridWidth, this.gridHeight, this.gridDepth];

    this.onChange = onChange;

    // * init buffers
    this.initBoxBuffers();
    this.initGridBuffers();
    this.initBoxBorderBuffers();

    this.loadPrograms(onLoaded);
  }

  async loadPrograms(onLoaded) {
    const programs = await this.wgl.createProgramsFromFiles({
      boxProgram: {
        vertexShader: "shaders/box.vert",
        fragmentShader: "shaders/box.frag",
      },
      boxWireframeProgram: {
        vertexShader: "shaders/boxwireframe.vert",
        fragmentShader: "shaders/boxwireframe.frag",
      },
      gridProgram: {
        vertexShader: "shaders/grid.vert",
        fragmentShader: "shaders/grid.frag",
      },
    });

    for (let programName in programs) {
      this[programName] = programs[programName];
    }

    onLoaded();
  }

  initBoxBuffers() {
    var wgl = this.wgl;

    this.cubeVertexBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.cubeVertexBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array([
        // Front face
        0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0,

        // Back face
        0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 0.0, 0.0,

        // Top face
        0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.0,

        // Bottom face
        0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0,

        // Right face
        1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0,

        // Left face
        0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 0.0,
      ]),
      wgl.STATIC_DRAW
    );

    this.cubeIndexBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.cubeIndexBuffer,
      wgl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([
        0,
        1,
        2,
        0,
        2,
        3, // front
        4,
        5,
        6,
        4,
        6,
        7, // back
        8,
        9,
        10,
        8,
        10,
        11, // top
        12,
        13,
        14,
        12,
        14,
        15, // bottom
        16,
        17,
        18,
        16,
        18,
        19, // right
        20,
        21,
        22,
        20,
        22,
        23, // left
      ]),
      wgl.STATIC_DRAW
    );
  }

  initBoxBorderBuffers() {
    var wgl = this.wgl;

    this.cubeWireframeVertexBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.cubeWireframeVertexBuffer,
      wgl.ARRAY_BUFFER,
      new Float32Array([
        0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0,

        0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0,
      ]),
      wgl.STATIC_DRAW
    );

    this.cubeWireframeIndexBuffer = wgl.createBuffer();
    wgl.bufferData(
      this.cubeWireframeIndexBuffer,
      wgl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([
        0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7,
      ]),
      wgl.STATIC_DRAW
    );
  }

  initGridBuffers() {
    var wgl = this.wgl;

    //there's one grid vertex buffer for the planes normal to each axis
    this.gridVertexBuffers = [];

    for (var axis = 0; axis < 3; ++axis) {
      this.gridVertexBuffers[axis] = wgl.createBuffer();

      var vertexData = [];

      var points; //the points that make up this grid plane

      if (axis === 0) {
        points = [
          [0, 0, 0],
          [0, this.gridHeight, 0],
          [0, this.gridHeight, this.gridDepth],
          [0, 0, this.gridDepth],
        ];
      } else if (axis === 1) {
        points = [
          [0, 0, 0],
          [this.gridWidth, 0, 0],
          [this.gridWidth, 0, this.gridDepth],
          [0, 0, this.gridDepth],
        ];
      } else if (axis === 2) {
        points = [
          [0, 0, 0],
          [this.gridWidth, 0, 0],
          [this.gridWidth, this.gridHeight, 0],
          [0, this.gridHeight, 0],
        ];
      }

      for (var i = 0; i < 4; ++i) {
        vertexData.push(points[i][0]);
        vertexData.push(points[i][1]);
        vertexData.push(points[i][2]);

        vertexData.push(points[(i + 1) % 4][0]);
        vertexData.push(points[(i + 1) % 4][1]);
        vertexData.push(points[(i + 1) % 4][2]);
      }

      wgl.bufferData(
        this.gridVertexBuffers[axis],
        wgl.ARRAY_BUFFER,
        new Float32Array(vertexData),
        wgl.STATIC_DRAW
      );
    }
  }

  /**
   * find the closest box that this collides with
   * @returns {Object | null} - {aabb: [x, y, z], t: }
   */
  getBoxIntersection(rayOrigin, rayDirection) {
    var bestIntersectionSoFar = {
      aabb: null,
      t: Infinity,
    };

    for (var i = 0; i < this.boxes.length; ++i) {
      var box = this.boxes[i];

      var intersection = rayAABBIntersection(rayOrigin, rayDirection, box);

      if (intersection !== null) {
        //if there is an intersection
        if (intersection.t < bestIntersectionSoFar.t) {
          //if this is closer than the best we've seen so far
          bestIntersectionSoFar = intersection;
        }
      }
    }

    if (bestIntersectionSoFar.aabb === null) {
      //if we didn't intersect any boxes
      return null;
    } else {
      return bestIntersectionSoFar;
    }
  }

  /**
   * tests for intersection with one of the bounding planes
   * @returns {Object | null} - {axis, side, point}
   */
  getBoundingPlaneIntersection(rayOrigin, rayDirection) {
    //we try to intersect with the two planes on each axis in turn (as long as they are facing towards the camera)
    //we assume we could only ever intersect with one of the planes so we break out as soon as we've found something

    for (var axis = 0; axis < 3; ++axis) {
      //now let's try intersecting with each side in turn
      for (var side = -1; side <= 1; side += 2) {
        //goes between -1 and 1 (hackish!

        //first let's make sure the plane is front facing to the ray
        var frontFacing =
          side === -1 ? rayDirection[axis] < 0 : rayDirection[axis] > 0;
        if (frontFacing) {
          var planeCoordinate = side === -1 ? 0 : this.gridDimensions[axis]; //the coordinate of the plane along this axis

          var t = (planeCoordinate - rayOrigin[axis]) / rayDirection[axis];

          if (t > 0) {
            var intersection = Utilities.addVectors(
              [],
              rayOrigin,
              Utilities.multiplyVectorByScalar([], rayDirection, t)
            );

            //if we're still within the bounds of the grid
            if (
              intersection[0] >= 0.0 &&
              intersection[0] <= this.gridDimensions[0] &&
              intersection[1] >= 0.0 &&
              intersection[1] <= this.gridDimensions[1] &&
              intersection[2] >= 0.0 &&
              intersection[2] <= this.gridDimensions[2]
            ) {
              return {
                axis: axis,
                side: side,
                point: intersection,
              };
            }
          }
        }
      }
    }

    return null; //no intersection found
  }

  /**
   * @returns {Object} - {origin: [x, y, z], direction: [x, y, z] normalized}
   */
  getMouseRay() {
    var fov = 2.0 * Math.atan(1.0 / this.projectionMatrix[5]);

    var viewSpaceMouseRay = [
      this.mouseX *
        Math.tan(fov / 2.0) *
        (this.canvas.width / this.canvas.height),
      this.mouseY * Math.tan(fov / 2.0),
      -1.0,
    ];

    var inverseViewMatrix = Utilities.invertMatrix(
      [],
      this.camera.getViewMatrix()
    );
    var mouseRay = Utilities.transformDirectionByMatrix(
      [],
      viewSpaceMouseRay,
      inverseViewMatrix
    );
    Utilities.normalizeVector(mouseRay, mouseRay);

    var rayOrigin = this.camera.getPosition();

    return {
      origin: rayOrigin,
      direction: mouseRay,
    };
  }

  drawGrid() {
    var wgl = this.wgl;

    for (var axis = 0; axis < 3; ++axis) {
      for (var side = 0; side <= 1; ++side) {
        var cameraPosition = this.camera.getPosition();

        var planePosition = [
          this.gridWidth / 2,
          this.gridHeight / 2,
          this.gridDepth / 2,
        ];
        planePosition[axis] = side === 0 ? 0 : this.gridDimensions[axis];

        var cameraDirection = Utilities.subtractVectors(
          [],
          planePosition,
          cameraPosition
        );

        var gridDrawState = wgl
          .createDrawState()
          .bindFramebuffer(null)
          .viewport(0, 0, this.canvas.width, this.canvas.height)

          .useProgram(this.gridProgram)

          .vertexAttribPointer(
            this.gridVertexBuffers[axis],
            this.gridProgram.getAttribLocation("a_vertexPosition"),
            3,
            wgl.FLOAT,
            wgl.FALSE,
            0,
            0
          )

          .uniformMatrix4fv("u_projectionMatrix", false, this.projectionMatrix)
          .uniformMatrix4fv("u_viewMatrix", false, this.camera.getViewMatrix());

        var translation = [0, 0, 0];
        translation[axis] = side * this.gridDimensions[axis];

        gridDrawState.uniform3f(
          "u_translation",
          translation[0],
          translation[1],
          translation[2]
        );

        if (
          (side === 0 && cameraDirection[axis] <= 0) ||
          (side === 1 && cameraDirection[axis] >= 0)
        ) {
          wgl.drawArrays(gridDrawState, wgl.LINES, 0, 8);
        }
      }
    }
  }

  drawBoxes() {
    var wgl = this.wgl;

    var boxDrawState = wgl
      .createDrawState()
      .bindFramebuffer(null)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .enable(wgl.DEPTH_TEST)
      .enable(wgl.CULL_FACE)

      .useProgram(this.boxProgram)

      .vertexAttribPointer(
        this.cubeVertexBuffer,
        this.boxProgram.getAttribLocation("a_cubeVertexPosition"),
        3,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .bindIndexBuffer(this.cubeIndexBuffer)

      .uniformMatrix4fv("u_projectionMatrix", false, this.projectionMatrix)
      .uniformMatrix4fv("u_viewMatrix", false, this.camera.getViewMatrix())

      .enable(wgl.POLYGON_OFFSET_FILL)
      .polygonOffset(1, 1);

    var boxToHighlight = null,
      sideToHighlight = null,
      highlightColor = null;

    if (this.interactionState !== null) {
      if (
        this.interactionState.mode === InteractionMode.RESIZING ||
        this.interactionState.mode === InteractionMode.EXTRUDING
      ) {
        boxToHighlight = this.interactionState.box;
        sideToHighlight = [1.5, 1.5, 1.5];
        sideToHighlight[this.interactionState.axis] =
          this.interactionState.side;

        highlightColor = [0.75, 0.75, 0.75];
      }
    } else if (!this.keyPressed[32] && !this.camera.isMouseDown()) {
      //if we're not interacting with anything and we're not in camera mode
      var mouseRay = this.getMouseRay();

      var boxIntersection = this.getBoxIntersection(
        mouseRay.origin,
        mouseRay.direction
      );

      //if we're over a box, let's highlight the side we're hovering over

      if (boxIntersection !== null) {
        boxToHighlight = boxIntersection.aabb;
        sideToHighlight = [1.5, 1.5, 1.5];
        sideToHighlight[boxIntersection.axis] = boxIntersection.side;

        highlightColor = [0.9, 0.9, 0.9];
      }

      //if we're not over a box but hovering over a bounding plane, let's draw a indicator point
      if (boxIntersection === null && !this.keyPressed[32]) {
        var planeIntersection = this.getBoundingPlaneIntersection(
          mouseRay.origin,
          mouseRay.direction
        );

        if (planeIntersection !== null) {
          var pointPosition = planeIntersection.point;
          quantizeVector(pointPosition, STEP);

          var rotation = [
            new Float32Array([0, 0, 1, 0, 1, 0, 1, 0, 0]),
            new Float32Array([1, 0, 0, 0, 0, 1, 0, 1, 0]),
            new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
          ][planeIntersection.axis];

          var pointDrawState = wgl
            .createDrawState()
            .bindFramebuffer(null)
            .viewport(0, 0, this.canvas.width, this.canvas.height)

            .enable(wgl.DEPTH_TEST)

            .useProgram(this.pointProgram)

            .vertexAttribPointer(
              this.pointVertexBuffer,
              this.pointProgram.getAttribLocation("a_position"),
              3,
              wgl.FLOAT,
              wgl.FALSE,
              0,
              0
            )

            .uniformMatrix4fv(
              "u_projectionMatrix",
              false,
              this.projectionMatrix
            )
            .uniformMatrix4fv(
              "u_viewMatrix",
              false,
              this.camera.getViewMatrix()
            )

            .uniform3f(
              "u_position",
              pointPosition[0],
              pointPosition[1],
              pointPosition[2]
            )

            .uniformMatrix3fv("u_rotation", false, rotation);

          wgl.drawArrays(pointDrawState, wgl.TRIANGLE_STRIP, 0, 4);
        }
      }
    }

    for (var i = 0; i < this.boxes.length; ++i) {
      var box = this.boxes[i];

      boxDrawState
        .uniform3f("u_translation", box.min[0], box.min[1], box.min[2])
        .uniform3f(
          "u_scale",
          box.max[0] - box.min[0],
          box.max[1] - box.min[1],
          box.max[2] - box.min[2]
        );

      if (box === boxToHighlight) {
        boxDrawState.uniform3f(
          "u_highlightSide",
          sideToHighlight[0],
          sideToHighlight[1],
          sideToHighlight[2]
        );
        boxDrawState.uniform3f(
          "u_highlightColor",
          highlightColor[0],
          highlightColor[1],
          highlightColor[2]
        );
      } else {
        boxDrawState.uniform3f("u_highlightSide", 1.5, 1.5, 1.5);
      }

      wgl.drawElements(boxDrawState, wgl.TRIANGLES, 36, wgl.UNSIGNED_SHORT);
    }
  }

  drawBoxesBorder() {
    var boxWireframeDrawState = wgl
      .createDrawState()
      .bindFramebuffer(null)
      .viewport(0, 0, this.canvas.width, this.canvas.height)

      .enable(wgl.DEPTH_TEST)

      .useProgram(this.boxWireframeProgram)

      .vertexAttribPointer(
        this.cubeWireframeVertexBuffer,
        this.boxWireframeProgram.getAttribLocation("a_cubeVertexPosition"),
        3,
        wgl.FLOAT,
        wgl.FALSE,
        0,
        0
      )

      .bindIndexBuffer(this.cubeWireframeIndexBuffer)

      .uniformMatrix4fv("u_projectionMatrix", false, this.projectionMatrix)
      .uniformMatrix4fv("u_viewMatrix", false, this.camera.getViewMatrix());

    for (var i = 0; i < this.boxes.length; ++i) {
      var box = this.boxes[i];

      boxWireframeDrawState
        .uniform3f("u_translation", box.min[0], box.min[1], box.min[2])
        .uniform3f(
          "u_scale",
          box.max[0] - box.min[0],
          box.max[1] - box.min[1],
          box.max[2] - box.min[2]
        );

      wgl.drawElements(
        boxWireframeDrawState,
        wgl.LINES,
        24,
        wgl.UNSIGNED_SHORT
      );
    }
  }

  draw() {
    var wgl = this.wgl;
    wgl.clear(
      wgl
        .createClearState()
        .bindFramebuffer(null)
        .clearColor(0.9, 0.9, 0.9, 1.0),
      wgl.COLOR_BUFFER_BIT | wgl.DEPTH_BUFFER_BIT
    );

    this.drawGrid();
    this.drawBoxes();
    this.drawBoxesBorder();
  }
}

/**
 * 
 * @param {*} rayOrigin 
 * @param {*} rayDirection 
 * @param {*} aabb 
 * @returns {Object | null} - {
                aabb: aabb,
                t: distance to intersection,

                point: point of intersection,

                //axis and side together define the plane of intersection (+x, -x, etc)
                axis: 0, 1 or 2 depending on x, y or z,
                side: -1 or 1 depending on which side the intersection happened on
            }
 */
function rayAABBIntersection(rayOrigin, rayDirection, aabb) {
  //we see it as a series of clippings in t of the line in the AABB planes along each axis
  //the part we are left with after clipping if successful is the region of the line within the AABB and thus we can extract the intersection

  //the part of the line we have clipped so far
  var lowT = -Infinity;
  var highT = Infinity;

  var intersectionAxis = 0;

  for (var i = 0; i < 3; ++i) {
    var t1 = (aabb.min[i] - rayOrigin[i]) / rayDirection[i];
    var t2 = (aabb.max[i] - rayOrigin[i]) / rayDirection[i];
    //so between t1 and t2 we are within the aabb planes in this dimension

    //ensure t1 < t2 (swap if necessary)
    if (t1 > t2) {
      var temp = t1;
      t1 = t2;
      t2 = temp;
    }

    //t1 and t2 now hold the lower and upper intersection t's respectively

    //the part of the line we just clipped for does not overlap the part previously clipped and thus there is no intersection
    if (t2 < lowT || t1 > highT) return null;

    //further clip the line between the planes in this axis
    if (t1 > lowT) {
      lowT = t1;

      intersectionAxis = i; //if we needed to futher clip in this axis then this is the closest intersection axis
    }

    if (t2 < highT) highT = t2;
  }

  if (lowT > highT) return null;

  //if we've reached this far then there is an intersection

  var intersection = [];
  for (var i = 0; i < 3; ++i) {
    intersection[i] = rayOrigin[i] + rayDirection[i] * lowT;
  }

  return {
    aabb: aabb,
    t: lowT,
    axis: intersectionAxis,
    side: rayDirection[intersectionAxis] > 0 ? -1 : 1,
    point: intersection,
  };
}

function quantize(x, step) {
  return Math.round(x / step) * step;
}

function quantizeVector(v, step) {
  for (var i = 0; i < v.length; ++i) {
    v[i] = quantize(v[i], step);
  }

  return v;
}
