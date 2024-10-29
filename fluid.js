"use strict";

const FOV = Math.PI / 3;
const PARTICLES_PER_CELL = 10;

const GRID_WIDTH = 40,
  GRID_HEIGHT = 20,
  GRID_DEPTH = 20;
const PRESETS = [
  //dam break
  [new AABB([0, 0, 0], [15, 20, 20])],

  //block drop
  [new AABB([0, 0, 0], [40, 7, 20]), new AABB([12, 12, 5], [28, 20, 15])],

  //double splash
  [new AABB([0, 0, 0], [10, 20, 15]), new AABB([30, 0, 5], [40, 20, 20])],
];

// state
const Status = {
  EDITING: 0,
  SIMULATING: 1,
};

class Fluid {
  state = Status.EDITING;
  currentPresetIndex = 0;
  // whether the user has edited the last set preset
  editedSinceLastPreset = false;
  //using gridCellDensity ensures a linear relationship to particle count ，simulation grid cell density per world space unit volume
  gridCellDensity = 0.5;
  // timeStep = 1.0 / 60.0;
  timeStep = 0;

  constructor(image) {
    this.image = image;

    var canvas = (this.canvas = document.getElementById("canvas"));
    var wgl = (this.wgl = new WrappedGL(canvas));
    wgl ? console.log("=== WebGL init", wgl) : alert("WebGL not supported");

    window.wgl = wgl;

    this.projectionMatrix = Utilities.makePerspectiveMatrix(
      new Float32Array(16),
      FOV,
      this.canvas.width / this.canvas.height,
      0.1,
      100.0
    );
    this.camera = new Camera(this.canvas, [
      GRID_WIDTH / 2,
      GRID_HEIGHT / 3,
      GRID_DEPTH / 2,
    ]);

    var boxEditorLoaded = false,
      simulatorRendererLoaded = false;

    // * init Class
    this.gridDimensions = [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH];
    this.boxEditor = new BoxEditor(
      this.canvas,
      this.wgl,
      this.projectionMatrix,
      this.camera,
      this.gridDimensions,
      function () {
        boxEditorLoaded = true;
        boxEditorLoaded && simulatorRendererLoaded && this.start();
      }.bind(this),
      function () {
        this.redrawUI();
      }.bind(this)
    );

    this.renderer = new Renderer(
      this.canvas,
      this.wgl,
      this.projectionMatrix,
      this.camera,
      this.gridDimensions,
      this.boxEditor,
      this.image,
      function () {
        simulatorRendererLoaded = true;
        boxEditorLoaded && simulatorRendererLoaded && this.start();
      }.bind(this)
    );
  }

  onResize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    Utilities.makePerspectiveMatrix(
      this.projectionMatrix,
      FOV,
      this.canvas.width / this.canvas.height,
      0.1,
      100.0
    );

    this.renderer.onResize();
    this.update();
  }

  onWheel(event) {
    event.preventDefault();
    this.camera.onWheel(event);

    if (this.state === Status.EDITING) {
      this.boxEditor.draw(event);
    } else if (this.state === Status.SIMULATING) {
      // this.renderer.onMouseMove(event);
    }
  }

  onMouseMove(event) {
    event.preventDefault();

    if (this.state === Status.EDITING) {
      this.boxEditor.onMouseMove(event);
      this.boxEditor.draw(event);

      if (this.boxEditor.interactionState !== null) {
        this.editedSinceLastPreset = true;
      }
    } else if (this.state === Status.SIMULATING) {
      this.renderer.onMouseMove(event);
    }
  }

  onMouseDown(event) {
    event.preventDefault();

    if (this.state === Status.EDITING) {
      this.boxEditor.onMouseDown(event);
      this.boxEditor.draw(event);
    } else if (this.state === Status.SIMULATING) {
      this.renderer.onMouseDown(event);
    }
  }

  onMouseUp(event) {
    event.preventDefault();

    if (this.state === Status.EDITING) {
      this.boxEditor.onMouseUp(event);
      this.boxEditor.draw(event);
    } else if (this.state === Status.SIMULATING) {
      this.renderer.onMouseUp(event);
    }
  }

  onKeyDown(event) {
    if (this.state === Status.EDITING) {
      this.boxEditor.onKeyDown(event);
    }
  }

  onKeyUp(event) {
    if (this.state === Status.EDITING) {
      this.boxEditor.onKeyUp(event);
    }
  }

  // * compute the number of particles for the current boxes and grid density
  getParticleCount() {
    var boxEditor = this.boxEditor;

    var gridCells =
      GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH * this.gridCellDensity;

    //assuming x:y:z ratio of 2:1:1
    var gridResolutionY = Math.ceil(Math.pow(gridCells / 2, 1.0 / 3.0));
    var gridResolutionZ = gridResolutionY * 1;
    var gridResolutionX = gridResolutionY * 2;

    var totalGridCells = gridResolutionX * gridResolutionY * gridResolutionZ;

    var totalVolume = 0;
    var cumulativeVolume = []; //at index i, contains the total volume up to and including box i (so index 0 has volume of first box, last index has total volume)

    for (var i = 0; i < boxEditor.boxes.length; ++i) {
      var box = boxEditor.boxes[i];
      var volume = box.computeVolume();

      totalVolume += volume;
      cumulativeVolume[i] = totalVolume;
    }

    var fractionFilled = totalVolume / (GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH);

    var desiredParticleCount =
      fractionFilled * totalGridCells * PARTICLES_PER_CELL; //theoretical number of particles

    return desiredParticleCount;
  }

  redrawUI() {
    var simulatingElements = document.querySelectorAll(".simulating-ui");
    var editingElements = document.querySelectorAll(".editing-ui");

    if (this.state === Status.SIMULATING) {
      this.playButton.style.display = "block";

      for (var i = 0; i < simulatingElements.length; ++i) {
        simulatingElements[i].style.display = "block";
      }

      for (var i = 0; i < editingElements.length; ++i) {
        editingElements[i].style.display = "none";
      }

      this.startButton.textContent = "Edit";
      this.startButton.className = "start-button-active";
    } else if (this.state === Status.EDITING) {
      this.playButton.style.display = "none";

      for (var i = 0; i < simulatingElements.length; ++i) {
        simulatingElements[i].style.display = "none";
      }

      for (var i = 0; i < editingElements.length; ++i) {
        editingElements[i].style.display = "block";
      }

      document.getElementById("particle-count").innerHTML =
        this.getParticleCount().toFixed(0) + " particles";

      if (
        this.boxEditor.boxes.length >= 2 ||
        (this.boxEditor.boxes.length === 1 &&
          (this.boxEditor.interactionState === null ||
            (this.boxEditor.interactionState.mode !==
              InteractionMode.EXTRUDING &&
              this.boxEditor.interactionState.mode !==
                InteractionMode.DRAWING)))
      ) {
        this.startButton.className = "start-button-active";
      } else {
        this.startButton.className = "start-button-inactive";
      }

      this.startButton.textContent = "Start";

      if (this.editedSinceLastPreset) {
        this.presetButton.innerHTML = "Use Preset";
      } else {
        this.presetButton.innerHTML = "Next Preset";
      }
    }

    this.flipnessSlider.redraw();
    this.densitySlider.redraw();
    this.speedSlider.redraw();
  }

  // * EDITING -> SIMULATING
  startSimulation() {
    this.state = Status.SIMULATING;

    var desiredParticleCount = this.getParticleCount(); //theoretical number of particles
    var particlesWidth = 512; //we fix particlesWidth
    var particlesHeight = Math.ceil(desiredParticleCount / particlesWidth); //then we calculate the particlesHeight that produces the closest particle count

    var particleCount = particlesWidth * particlesHeight;
    var particlePositions = [];

    var boxEditor = this.boxEditor;

    var totalVolume = 0;
    for (var i = 0; i < boxEditor.boxes.length; ++i) {
      totalVolume += boxEditor.boxes[i].computeVolume();
    }

    var particlesCreatedSoFar = 0;
    for (var i = 0; i < boxEditor.boxes.length; ++i) {
      var box = boxEditor.boxes[i];

      var particlesInBox = 0;
      if (i < boxEditor.boxes.length - 1) {
        particlesInBox = Math.floor(
          (particleCount * box.computeVolume()) / totalVolume
        );
      } else {
        //for the last box we just use up all the remaining particles
        particlesInBox = particleCount - particlesCreatedSoFar;
      }

      for (var j = 0; j < particlesInBox; ++j) {
        var position = box.randomPoint();
        particlePositions.push(position);
      }

      particlesCreatedSoFar += particlesInBox;
    }

    var gridCells =
      GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH * this.gridCellDensity;

    //assuming x:y:z ratio of 2:1:1
    var gridResolutionY = Math.ceil(Math.pow(gridCells / 2, 1.0 / 3.0));
    var gridResolutionZ = gridResolutionY * 1;
    var gridResolutionX = gridResolutionY * 2;

    var gridSize = [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH];
    var gridResolution = [gridResolutionX, gridResolutionY, gridResolutionZ];

    var sphereRadius = 7.0 / gridResolutionX;
    this.renderer.reset(
      particlesWidth,
      particlesHeight,
      particlePositions,
      gridSize,
      gridResolution,
      PARTICLES_PER_CELL,
      sphereRadius
    );

    this.camera.setBounds(0, Math.PI / 2);

    this.update();
  }

  // * SIMULATING -> EDITING
  stopSimulation() {
    this.state = Status.EDITING;
    this.camera.setBounds(-Math.PI / 4, Math.PI / 4);

    this.update();
  }

  start() {
    this.state = Status.EDITING;
    console.log("=== start");

    // * UI
    this.densitySlider = new Slider(
      document.getElementById("density-slider"),
      this.gridCellDensity,
      0.2,
      3.0,
      function (value) {
        this.gridCellDensity = value;

        this.redrawUI();
      }.bind(this)
    );

    this.flipnessSlider = new Slider(
      document.getElementById("fluidity-slider"),
      this.renderer.simulator.flipness,
      0.5,
      0.99,
      function (value) {
        this.renderer.simulator.flipness = value;
      }.bind(this)
    );

    this.speedSlider = new Slider(
      document.getElementById("speed-slider"),
      this.timeStep,
      0.0,
      1.0 / 60.0,
      function (value) {
        this.timeStep = value;
      }.bind(this)
    );

    const onStart = () => {
      if (this.state === Status.EDITING) {
        if (this.boxEditor.boxes.length > 0) {
          this.startSimulation();
        }
      } else if (this.state === Status.SIMULATING) {
        this.stopSimulation();
      }
      this.redrawUI();
    };

    this.playButton = document.getElementById("play-button");
    this.playButton.addEventListener("click", () => {
      this.timeStep = this.timeStep ? 0 : 1.0 / 60.0;
    });

    this.startButton = document.getElementById("start-button");
    this.startButton.addEventListener("click", onStart);

    this.presetButton = document.getElementById("preset-button");
    this.presetButton.addEventListener(
      "click",
      function () {
        this.editedSinceLastPreset = false;
        this.boxEditor.boxes.length = 0;

        var preset = PRESETS[this.currentPresetIndex];
        for (var i = 0; i < preset.length; ++i) {
          this.boxEditor.boxes.push(preset[i].clone());
        }

        this.currentPresetIndex =
          (this.currentPresetIndex + 1) % PRESETS.length;

        this.redrawUI();
      }.bind(this)
    );
    this.presetButton.click();
    this.onResize();

    /** init */
    canvas.addEventListener("wheel", this.onWheel.bind(this));
    canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
    document.addEventListener("mouseup", this.onMouseUp.bind(this));

    document.addEventListener("keydown", this.onKeyDown.bind(this));
    document.addEventListener("keyup", this.onKeyUp.bind(this));

    window.addEventListener("resize", this.onResize.bind(this));
  }

  update() {
    console.log("=== update", this.state);
    if (this.state === Status.EDITING) {
      this.boxEditor.draw();
      cancelAnimationFrame(this.animationId);
    } else if (this.state === Status.SIMULATING) {
      // * start the update loop
      var lastTime = 0;
      var updateAnimation = function (currentTime) {
        var deltaTime = currentTime - lastTime || 0;
        lastTime = currentTime;
        this.renderer.update(this.timeStep);
        this.animationId = requestAnimationFrame(updateAnimation);
      }.bind(this);
      updateAnimation();
    }
  }
}
