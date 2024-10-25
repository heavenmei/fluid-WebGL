"use strict";

class WrappedGL {
  constructor(canvas, options) {
    var gl = (this.gl =
      canvas.getContext("webgl", options) ||
      canvas.getContext("experimental-webgl", options));

    for (var i = 0; i < CONSTANT_NAMES.length; i += 1) {
      this[CONSTANT_NAMES[i]] = gl[CONSTANT_NAMES[i]];
    }

    this.changedParameters = {}; //parameters that aren't default

    //each parameter is an object like
    /*
        {
            defaults: [values],
            setter: function (called with this set to gl)

            //undefined flag means not used
            usedInDraw: whether this state matters for drawing
            usedInClear: whether this state matters for clearing
            usedInRead: wheter this state matters for reading
        }

        //the number of parameters in each defaults array corresponds to the arity of the corresponding setter
        */

    this.parameters = {
      framebuffer: {
        defaults: [null],
        setter: function (framebuffer) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        },
        usedInDraw: true,
        usedInClear: true,
        usedInRead: true,
      },
      program: {
        defaults: [{ program: null }],
        setter: function (wrappedProgram) {
          gl.useProgram(wrappedProgram.program);
        },
        usedInDraw: true,
      },
      viewport: {
        defaults: [0, 0, 0, 0],
        setter: gl.viewport,
        usedInDraw: true,
      },
      indexBuffer: {
        defaults: [null],
        setter: function (buffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
        },
        usedInDraw: true,
      },
      depthTest: {
        defaults: [false],
        setter: function (enabled) {
          if (enabled) {
            gl.enable(gl.DEPTH_TEST);
          } else {
            gl.disable(gl.DEPTH_TEST);
          }
        },
        usedInDraw: true,
      },
      depthFunc: {
        defaults: [gl.LESS],
        setter: gl.depthFunc,
        usedInDraw: true,
      },
      cullFace: {
        defaults: [false],
        setter: function (enabled) {
          if (enabled) {
            gl.enable(gl.CULL_FACE);
          } else {
            gl.disable(gl.CULL_FACE);
          }
        },
        usedInDraw: true,
      },
      frontFace: {
        defaults: [gl.CCW],
        setter: gl.frontFace,
      },
      blend: {
        defaults: [false],
        setter: function (enabled) {
          if (enabled) {
            gl.enable(gl.BLEND);
          } else {
            gl.disable(gl.BLEND);
          }
        },
        usedInDraw: true,
      },
      blendEquation: {
        defaults: [gl.FUNC_ADD, gl.FUNC_ADD],
        setter: gl.blendEquationSeparate,
        usedInDraw: true,
      },
      blendFunc: {
        defaults: [gl.ONE, gl.ZERO, gl.ONE, gl.ZERO],
        setter: gl.blendFuncSeparate,
        usedInDraw: true,
      },
      polygonOffsetFill: {
        defaults: [false],
        setter: function (enabled) {
          if (enabled) {
            gl.enable(gl.POLYGON_OFFSET_FILL);
          } else {
            gl.disable(gl.POLYGON_OFFSET_FILL);
          }
        },
        usedInDraw: true,
      },
      polygonOffset: {
        defaults: [0, 0],
        setter: gl.polygonOffset,
        usedInDraw: true,
      },
      scissorTest: {
        defaults: [false],
        setter: function (enabled) {
          if (enabled) {
            gl.enable(gl.SCISSOR_TEST);
          } else {
            gl.disable(gl.SCISSOR_TEST);
          }
        },
        usedInDraw: true,
        usedInClear: true,
      },
      scissor: {
        defaults: [0, 0, 0, 0],
        setter: gl.scissor,
        usedInDraw: true,
        usedInClear: true,
      },
      colorMask: {
        defaults: [true, true, true, true],
        setter: gl.colorMask,
        usedInDraw: true,
        usedInClear: true,
      },
      depthMask: {
        defaults: [true],
        setter: gl.depthMask,
        usedInDraw: true,
        usedInClear: true,
      },
      clearColor: {
        defaults: [0, 0, 0, 0],
        setter: gl.clearColor,
        usedInClear: true,
      },
      clearDepth: {
        defaults: [1],
        setter: gl.clearDepth,
        usedInClear: true,
      },
    };

    var maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    for (var i = 0; i < maxVertexAttributes; ++i) {
      //we need to capture the index in a closure
      this.parameters["attributeArray" + i.toString()] = {
        defaults: [null, 0, null, false, 0, 0],
        setter: (function () {
          var index = i;

          return function (buffer, size, type, normalized, stride, offset) {
            if (buffer !== null) {
              gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
              gl.vertexAttribPointer(
                index,
                size,
                type,
                normalized,
                stride,
                offset
              );

              gl.enableVertexAttribArray(index); //TODO: cache this
            }
          };
        })(),
        usedInDraw: true,
      };
    }

    var maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    for (var i = 0; i < maxTextures; ++i) {
      this.parameters["texture" + i.toString()] = {
        defaults: [gl.TEXTURE_2D, null],
        setter: (function () {
          //we need to capture the unit in a closure
          var unit = i;

          return function (target, texture) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(target, texture);
          };
        })(),
        usedInDraw: true,
      };
    }

    this.uniformSetters = {
      "1i": gl.uniform1i,
      "2i": gl.uniform2i,
      "3i": gl.uniform3i,
      "4i": gl.uniform4i,
      "1f": gl.uniform1f,
      "2f": gl.uniform2f,
      "3f": gl.uniform3f,
      "4f": gl.uniform4f,
      "1fv": gl.uniform1fv,
      "2fv": gl.uniform2fv,
      "3fv": gl.uniform3fv,
      "4fv": gl.uniform4fv,
      matrix2fv: gl.uniformMatrix2fv,
      matrix3fv: gl.uniformMatrix3fv,
      matrix4fv: gl.uniformMatrix4fv,
    };

    this.defaultTextureUnit = 0; //the texure unit we use for modifying textures
  }

  /**
   *
   * @param {string} vertexShaderSource
   * @param {string} fragmentShaderSource
   * @param {Object} attributeLocations
   * @returns {WrappedProgram}
   */
  createProgram(vertexShaderSource, fragmentShaderSource, attributeLocations) {
    return new WrappedProgram(
      this,
      vertexShaderSource,
      fragmentShaderSource,
      attributeLocations
    );
  }

  /**
   * loads text files and calls callback with an object
   * @param {string[]} filenames
   * @param {Function} onLoaded - { filename: 'content', otherFilename, 'morecontent' }
   */
  static loadTextFiles(filenames, onLoaded) {
    let loadedSoFar = 0;
    const results = {};
    filenames.forEach((filename) => {
      fetch(filename)
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `Failed to load ${filename}: ${response.statusText}`
            );
          }
          return response.text();
        })
        .then((text) => {
          results[filename] = text;
          loadedSoFar += 1;
          if (loadedSoFar === filenames.length) {
            onLoaded(results);
          }
        })
        .catch((error) => {
          console.error(error);
        });
    });
  }

  /**
   * @async
   * @param {string|string[]} vertexShaderPath
   * @param {string|string[]} fragmentShaderPath
   * @param {Object} attributeLocations
   * @param {Function} successCallback - {firstProgram: firstProgramObject,secondProgram: secondProgramObject}
   * @param {Function} failureCallback
   */
  createProgramFromFiles(
    vertexShaderPath,
    fragmentShaderPath,
    attributeLocations,
    successCallback,
    failureCallback
  ) {
    const filesToLoad = [
      ...(Array.isArray(vertexShaderPath)
        ? vertexShaderPath
        : [vertexShaderPath]),
      ...(Array.isArray(fragmentShaderPath)
        ? fragmentShaderPath
        : [fragmentShaderPath]),
    ];

    WrappedGL.loadTextFiles(filesToLoad, (files) => {
      const vertexShaderSources = Array.isArray(vertexShaderPath)
        ? vertexShaderPath.map((path) => files[path])
        : [files[vertexShaderPath]];

      const fragmentShaderSources = Array.isArray(fragmentShaderPath)
        ? fragmentShaderPath.map((path) => files[path])
        : [files[fragmentShaderPath]];

      const program = this.createProgram(
        vertexShaderSources.join("\n"),
        fragmentShaderSources.join("\n"),
        attributeLocations
      );
      successCallback(program);
    });
  }

  /**
   * @async
   * @param {Object} programParameters -
   {
        firstProgram: {
            vertexShader: 'first.vert' or [...],
            fragmentShader: 'first.frag' or [...],
            attributeLocations: {
                0: 'a_attribute'
            }
        },
        ...
    }
   * @param {Function} successCallback - {firstProgram: firstProgramObject,secondProgram: secondProgramObject}
   * @param {Function} failureCallback 
   */
  createProgramsFromFiles(programParameters, successCallback, failureCallback) {
    const programCount = Object.keys(programParameters).length;
    let loadedSoFar = 0;
    const programs = {};

    Object.entries(programParameters).forEach(([programName, parameters]) => {
      this.createProgramFromFiles(
        parameters.vertexShader,
        parameters.fragmentShader,
        parameters.attributeLocations,
        (program) => {
          programs[programName] = program;
          loadedSoFar++;
          if (loadedSoFar === programCount) {
            successCallback(programs);
          }
        }
      );
    });
  }

  createDrawState() {
    return new DrawState(this);
  }

  createClearState() {
    return new ClearState(this);
  }

  createReadState() {
    return new ReadState(this);
  }

  createBuffer() {
    return this.gl.createBuffer();
  }

  bufferData(buffer, target, data, usage) {
    var gl = this.gl;

    if (target === gl.ARRAY_BUFFER) {
      //we don't really care about the vertex buffer binding state...
    } else if (target === gl.ELEMENT_ARRAY_BUFFER) {
      this.changedParameters.indexBuffer = [buffer];
    }

    // copy data to Object "buffer" in the GPU
    gl.bindBuffer(target, buffer);
    gl.bufferData(target, data, usage);
  }

  createRenderbuffer() {
    return this.gl.createRenderbuffer();
  }
  renderbufferStorage(renderbuffer, target, internalformat, width, height) {
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, renderbuffer);
    this.gl.renderbufferStorage(target, internalformat, width, height);

    return this;
  }

  createTexture() {
    return this.gl.createTexture();
  }

  bindTextureForEditing(target, texture) {
    this.gl.activeTexture(this.gl.TEXTURE0 + this.defaultTextureUnit);
    this.gl.bindTexture(target, texture);

    this.changedParameters["texture" + this.defaultTextureUnit.toString()] = [
      target,
      texture,
    ];
  }

  //this function is overloaded, it can be either
  //(target, texture, level, internalformat, width, height, border, format, type, pixels)
  //(target, texture, level, internalformat, format, type, object)
  texImage2D(target, texture) {
    var args = Array.prototype.slice.call(arguments, 2);
    args.unshift(target); //add target to for texImage2D arguments list

    this.bindTextureForEditing(target, texture);
    this.gl.texImage2D.apply(this.gl, args);

    return this;
  }

  texParameteri(target, texture, pname, param) {
    this.bindTextureForEditing(target, texture);
    this.gl.texParameteri(target, pname, param);

    return this;
  }

  setTextureFiltering(target, texture, wrapS, wrapT, minFilter, magFilter) {
    var gl = this.gl;

    this.bindTextureForEditing(target, texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

    return this;
  }

  //flag is one of usedInDraw, usedInClear, usedInRead
  resolveState(state, flag) {
    var gl = this.gl;

    //first let's revert all states to default that were set but now aren't set
    for (var parameterName in this.changedParameters) {
      if (this.changedParameters.hasOwnProperty(parameterName)) {
        if (!state.changedParameters.hasOwnProperty(parameterName)) {
          //if this is not set in the incoming draw state then we need to go back to default
          if (this.parameters[parameterName][flag]) {
            this.parameters[parameterName].setter.apply(
              this.gl,
              this.parameters[parameterName].defaults
            );

            delete this.changedParameters[parameterName];
          }
        }
      }
    }

    //now we set all of the new incoming states

    for (var parameterName in state.changedParameters) {
      if (state.changedParameters.hasOwnProperty(parameterName)) {
        if (
          !this.changedParameters.hasOwnProperty(parameterName) || //if this state is not currently set
          !arraysEqual(
            this.changedParameters[parameterName],
            state.changedParameters[parameterName]
          ) //or if it's changed
        ) {
          this.changedParameters[parameterName] =
            state.changedParameters[parameterName];

          this.parameters[parameterName].setter.apply(
            this.gl,
            this.changedParameters[parameterName]
          );
        }
      }
    }
  }

  resolveDrawState(drawState) {
    var gl = this.gl;

    this.resolveState(drawState, "usedInDraw");

    //resolve uniform values
    //we don't diff uniform values, it's just not worth it
    var program = drawState.changedParameters.program[0]; //we assume a draw state has a program

    for (var uniformName in drawState.uniforms) {
      if (drawState.uniforms.hasOwnProperty(uniformName)) {
        //this array creation is annoying....
        var args = [program.uniformLocations[uniformName]].concat(
          drawState.uniforms[uniformName].value
        );

        this.uniformSetters[drawState.uniforms[uniformName].type].apply(
          gl,
          args
        );
      }
    }
  }

  resolveClearState(clearState) {
    this.resolveState(clearState, "usedInClear");
  }

  /**
   * 运行
   * @param {State} drawState
   * @param {*} mode - 图元类型
   * @param {number} first - offset
   * @param {number} count - 运行次数
   */
  drawArrays(drawState, mode, first, count) {
    this.resolveDrawState(drawState);
    this.gl.drawArrays(mode, first, count);
  }

  clear(clearState, bit) {
    this.resolveClearState(clearState);

    this.gl.clear(bit);
  }
}

class WrappedProgram {
  uniformLocations = {};
  uniforms = {};
  attributeLocations = {};

  constructor(
    wgl,
    vertexShaderSource,
    fragmentShaderSource,
    requestedAttributeLocations
  ) {
    // TODO: if we want to cache uniform values in the future

    const gl = wgl.gl;

    // Build shaders from source
    const vertexShader = this.buildShader(
      gl,
      gl.VERTEX_SHADER,
      vertexShaderSource
    );
    const fragmentShader = this.buildShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );

    // Create program and attach shaders
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);

    // Bind the attribute locations that have been specified in attributeLocations
    if (requestedAttributeLocations !== undefined) {
      for (const attributeName in requestedAttributeLocations) {
        gl.bindAttribLocation(
          this.program,
          requestedAttributeLocations[attributeName],
          attributeName
        );
      }
    }
    gl.linkProgram(this.program);

    // Construct this.attributeLocations (maps attribute names to locations)
    const numberOfAttributes = gl.getProgramParameter(
      this.program,
      gl.ACTIVE_ATTRIBUTES
    );
    for (let i = 0; i < numberOfAttributes; ++i) {
      const activeAttrib = gl.getActiveAttrib(this.program, i);
      const attributeName = activeAttrib.name;
      this.attributeLocations[attributeName] = gl.getAttribLocation(
        this.program,
        attributeName
      );
    }

    // Cache uniform locations
    const uniformLocations = (this.uniformLocations = {});
    const numberOfUniforms = gl.getProgramParameter(
      this.program,
      gl.ACTIVE_UNIFORMS
    );
    for (let i = 0; i < numberOfUniforms; i += 1) {
      const activeUniform = gl.getActiveUniform(this.program, i);
      const uniformLocation = gl.getUniformLocation(
        this.program,
        activeUniform.name
      );
      uniformLocations[activeUniform.name] = uniformLocation;
    }
  }

  buildShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Log any errors
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.log(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
    }
    return shader;
  }

  // TODO: maybe this should be on WrappedGL?
  getAttribLocation(name) {
    return this.attributeLocations[name];
  }
}

class State {
  constructor(wgl) {
    this.wgl = wgl;

    //all states that have been changed from defaults
    /* map of state string to array of values. eg:
      'framebuffer: [framebuffer],
      'viewport': [x, y, width, height],
    */
    this.changedParameters = {};
  }

  setParameter(parameterName, values) {
    if (!arraysEqual(values, this.wgl.parameters[parameterName].defaults)) {
      //if the state hasn't been set to the defaults
      this.changedParameters[parameterName] = values;
    } else {
      //if we're going back to defaults
      if (this.changedParameters.hasOwnProperty(parameterName)) {
        delete this.changedParameters[parameterName];
      }
    }
  }

  clone() {
    const newState = new this.constructor(this.wgl);

    for (const parameterName in this.changedParameters) {
      if (this.changedParameters.hasOwnProperty(parameterName)) {
        const parameterValues = this.changedParameters[parameterName];
        const clonedValues = [];
        for (let i = 0; i < parameterValues.length; ++i) {
          clonedValues.push(parameterValues[i]);
        }
        newState.changedParameters[parameterName] = clonedValues;
      }
    }

    return newState;
  }
}

class DrawState extends State {
  constructor(wgl) {
    super(wgl);
    this.uniforms = {}; // we always set uniforms, e.g., {type: '3f', value: [x, y, z]}
  }

  bindFramebuffer(framebuffer) {
    this.setParameter("framebuffer", [framebuffer]);
    return this;
  }

  viewport(x, y, width, height) {
    this.setParameter("viewport", [x, y, width, height]);
    return this;
  }

  enable(cap) {
    if (cap === this.wgl.DEPTH_TEST) {
      this.setParameter("depthTest", [true]);
    } else if (cap === this.wgl.BLEND) {
      this.setParameter("blend", [true]);
    } else if (cap === this.wgl.CULL_FACE) {
      this.setParameter("cullFace", [true]);
    } else if (cap === this.wgl.POLYGON_OFFSET_FILL) {
      this.setParameter("polygonOffsetFill", [true]);
    } else if (cap === this.wgl.SCISSOR_TEST) {
      this.setParameter("scissorTest", [true]);
    }
    return this;
  }

  disable(cap) {
    if (cap === this.wgl.DEPTH_TEST) {
      this.setParameter("depthTest", [false]);
    } else if (cap === this.wgl.BLEND) {
      this.setParameter("blend", [false]);
    } else if (cap === this.wgl.CULL_FACE) {
      this.setParameter("cullFace", [false]);
    } else if (cap === this.wgl.POLYGON_OFFSET_FILL) {
      this.setParameter("polygonOffsetFill", [false]);
    } else if (cap === this.wgl.SCISSOR_TEST) {
      this.setParameter("scissorTest", [false]);
    }
    return this;
  }

  /**
   * 属性绑定到当前的ARRAY_BUFFER
   * @param {*} buffer
   * @param {number} index
   * @param {number} size - 每次迭代运行提取size个单位数据
   * @param {*} type - 每个单位的数据类型
   * @param {Boolean} normalized - 归一化
   * @param {number} stride - 0 = 移动单位数量 * 每个单位占用内存（sizeof(type)）每次迭代运行运动多少内存到下一个数据开始点
   * @param {number} offset - 从缓冲起始位置开始读取
   * @returns
   */
  vertexAttribPointer(buffer, index, size, type, normalized, stride, offset) {
    this.setParameter("attributeArray" + index.toString(), [
      buffer,
      size,
      type,
      normalized,
      stride,
      offset,
    ]);

    if (
      this.instancedExt &&
      this.changedParameters.hasOwnProperty(
        "attributeDivisor" + index.toString()
      )
    ) {
      // we need to have divisor information for any attribute location that has a bound buffer
      this.setParameter("attributeDivisor" + index.toString(), [0]);
    }
    return this;
  }

  bindIndexBuffer(buffer) {
    this.setParameter("indexBuffer", [buffer]);
    return this;
  }

  depthFunc(func) {
    this.setParameter("depthFunc", [func]);
    return this;
  }

  frontFace(mode) {
    this.setParameter("frontFace", [mode]);
    return this;
  }

  blendEquation(mode) {
    this.blendEquationSeparate(mode, mode);
    return this;
  }

  blendEquationSeparate(modeRGB, modeAlpha) {
    this.setParameter("blendEquation", [modeRGB, modeAlpha]);
    return this;
  }

  blendFunc(sFactor, dFactor) {
    this.blendFuncSeparate(sFactor, dFactor, sFactor, dFactor);
    return this;
  }

  blendFuncSeparate(srcRGB, dstRGB, srcAlpha, dstAlpha) {
    this.setParameter("blendFunc", [srcRGB, dstRGB, srcAlpha, dstAlpha]);
    return this;
  }

  scissor(x, y, width, height) {
    this.setParameter("scissor", [x, y, width, height]);
    return this;
  }

  useProgram(program) {
    this.setParameter("program", [program]);
    return this;
  }

  bindTexture(unit, target, texture) {
    this.setParameter("texture" + unit.toString(), [target, texture]);
    return this;
  }

  colorMask(r, g, b, a) {
    this.setParameter("colorMask", [r, g, b, a]);
    return this;
  }

  depthMask(enabled) {
    this.setParameter("depthMask", [enabled]);
    return this;
  }

  polygonOffset(factor, units) {
    this.setParameter("polygonOffset", [factor, units]);
    return this;
  }

  uniformTexture(uniformName, unit, target, texture) {
    this.uniform1i(uniformName, unit);
    this.bindTexture(unit, target, texture);
    return this;
  }

  uniform1i(uniformName, value) {
    this.uniforms[uniformName] = { type: "1i", value: [value] };
    return this;
  }

  uniform2i(uniformName, x, y) {
    this.uniforms[uniformName] = { type: "2i", value: [x, y] };
    return this;
  }

  uniform3i(uniformName, x, y, z) {
    this.uniforms[uniformName] = { type: "3i", value: [x, y, z] };
    return this;
  }

  uniform4i(uniformName, x, y, z, w) {
    this.uniforms[uniformName] = { type: "4i", value: [x, y, z, w] };
    return this;
  }

  uniform1f(uniformName, value) {
    this.uniforms[uniformName] = { type: "1f", value: value };
    return this;
  }

  uniform2f(uniformName, x, y) {
    this.uniforms[uniformName] = { type: "2f", value: [x, y] };
    return this;
  }

  uniform3f(uniformName, x, y, z) {
    this.uniforms[uniformName] = { type: "3f", value: [x, y, z] };
    return this;
  }

  uniform4f(uniformName, x, y, z, w) {
    this.uniforms[uniformName] = { type: "4f", value: [x, y, z, w] };
    return this;
  }

  uniform1fv(uniformName, value) {
    this.uniforms[uniformName] = { type: "1fv", value: [value] };
    return this;
  }

  uniform2fv(uniformName, value) {
    this.uniforms[uniformName] = { type: "2fv", value: [value] };
    return this;
  }

  uniform3fv(uniformName, value) {
    this.uniforms[uniformName] = { type: "3fv", value: [value] };
    return this;
  }

  uniform4fv(uniformName, value) {
    this.uniforms[uniformName] = { type: "4fv", value: [value] };
    return this;
  }

  uniformMatrix2fv(uniformName, transpose, matrix) {
    this.uniforms[uniformName] = {
      type: "matrix2fv",
      value: [transpose, matrix],
    };
    return this;
  }

  uniformMatrix3fv(uniformName, transpose, matrix) {
    this.uniforms[uniformName] = {
      type: "matrix3fv",
      value: [transpose, matrix],
    };
    return this;
  }

  uniformMatrix4fv(uniformName, transpose, matrix) {
    this.uniforms[uniformName] = {
      type: "matrix4fv",
      value: [transpose, matrix],
    };
    return this;
  }
}

class ClearState extends State {
  constructor(wgl) {
    super(wgl);
  }

  bindFramebuffer(framebuffer) {
    this.setParameter("framebuffer", [framebuffer]);
    return this;
  }

  clearColor(r, g, b, a) {
    this.setParameter("clearColor", [r, g, b, a]);
    return this;
  }

  clearDepth(depth) {
    this.setParameter("clearDepth", [depth]);
    return this;
  }

  colorMask(r, g, b, a) {
    this.setParameter("colorMask", [r, g, b, a]);
    return this;
  }

  depthMask(enabled) {
    this.setParameter("depthMask", [enabled]);
    return this;
  }
}

class ReadState extends State {
  constructor(wgl) {
    super(wgl);
  }

  bindFramebuffer(framebuffer) {
    this.setParameter("framebuffer", [framebuffer]);
    return this;
  }
}

//assumes a and b are equal length
function arraysEqual(a, b) {
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

var CONSTANT_NAMES = [
  "ACTIVE_ATTRIBUTES",
  "ACTIVE_ATTRIBUTE_MAX_LENGTH",
  "ACTIVE_TEXTURE",
  "ACTIVE_UNIFORMS",
  "ACTIVE_UNIFORM_MAX_LENGTH",
  "ALIASED_LINE_WIDTH_RANGE",
  "ALIASED_POINT_SIZE_RANGE",
  "ALPHA",
  "ALPHA_BITS",
  "ALWAYS",
  "ARRAY_BUFFER",
  "ARRAY_BUFFER_BINDING",
  "ATTACHED_SHADERS",
  "BACK",
  "BLEND",
  "BLEND_COLOR",
  "BLEND_DST_ALPHA",
  "BLEND_DST_RGB",
  "BLEND_EQUATION",
  "BLEND_EQUATION_ALPHA",
  "BLEND_EQUATION_RGB",
  "BLEND_SRC_ALPHA",
  "BLEND_SRC_RGB",
  "BLUE_BITS",
  "BOOL",
  "BOOL_VEC2",
  "BOOL_VEC3",
  "BOOL_VEC4",
  "BROWSER_DEFAULT_WEBGL",
  "BUFFER_SIZE",
  "BUFFER_USAGE",
  "BYTE",
  "CCW",
  "CLAMP_TO_EDGE",
  "COLOR_ATTACHMENT0",
  "COLOR_BUFFER_BIT",
  "COLOR_CLEAR_VALUE",
  "COLOR_WRITEMASK",
  "COMPILE_STATUS",
  "COMPRESSED_TEXTURE_FORMATS",
  "CONSTANT_ALPHA",
  "CONSTANT_COLOR",
  "CONTEXT_LOST_WEBGL",
  "CULL_FACE",
  "CULL_FACE_MODE",
  "CURRENT_PROGRAM",
  "CURRENT_VERTEX_ATTRIB",
  "CW",
  "DECR",
  "DECR_WRAP",
  "DELETE_STATUS",
  "DEPTH_ATTACHMENT",
  "DEPTH_BITS",
  "DEPTH_BUFFER_BIT",
  "DEPTH_CLEAR_VALUE",
  "DEPTH_COMPONENT",
  "DEPTH_COMPONENT16",
  "DEPTH_FUNC",
  "DEPTH_RANGE",
  "DEPTH_STENCIL",
  "DEPTH_STENCIL_ATTACHMENT",
  "DEPTH_TEST",
  "DEPTH_WRITEMASK",
  "DITHER",
  "DONT_CARE",
  "DST_ALPHA",
  "DST_COLOR",
  "DYNAMIC_DRAW",
  "ELEMENT_ARRAY_BUFFER",
  "ELEMENT_ARRAY_BUFFER_BINDING",
  "EQUAL",
  "FASTEST",
  "FLOAT",
  "FLOAT_MAT2",
  "FLOAT_MAT3",
  "FLOAT_MAT4",
  "FLOAT_VEC2",
  "FLOAT_VEC3",
  "FLOAT_VEC4",
  "FRAGMENT_SHADER",
  "FRAMEBUFFER",
  "FRAMEBUFFER_ATTACHMENT_OBJECT_NAME",
  "FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE",
  "FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE",
  "FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL",
  "FRAMEBUFFER_BINDING",
  "FRAMEBUFFER_COMPLETE",
  "FRAMEBUFFER_INCOMPLETE_ATTACHMENT",
  "FRAMEBUFFER_INCOMPLETE_DIMENSIONS",
  "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT",
  "FRAMEBUFFER_UNSUPPORTED",
  "FRONT",
  "FRONT_AND_BACK",
  "FRONT_FACE",
  "FUNC_ADD",
  "FUNC_REVERSE_SUBTRACT",
  "FUNC_SUBTRACT",
  "GENERATE_MIPMAP_HINT",
  "GEQUAL",
  "GREATER",
  "GREEN_BITS",
  "HIGH_FLOAT",
  "HIGH_INT",
  "INCR",
  "INCR_WRAP",
  "INFO_LOG_LENGTH",
  "INT",
  "INT_VEC2",
  "INT_VEC3",
  "INT_VEC4",
  "INVALID_ENUM",
  "INVALID_FRAMEBUFFER_OPERATION",
  "INVALID_OPERATION",
  "INVALID_VALUE",
  "INVERT",
  "KEEP",
  "LEQUAL",
  "LESS",
  "LINEAR",
  "LINEAR_MIPMAP_LINEAR",
  "LINEAR_MIPMAP_NEAREST",
  "LINES",
  "LINE_LOOP",
  "LINE_STRIP",
  "LINE_WIDTH",
  "LINK_STATUS",
  "LOW_FLOAT",
  "LOW_INT",
  "LUMINANCE",
  "LUMINANCE_ALPHA",
  "MAX_COMBINED_TEXTURE_IMAGE_UNITS",
  "MAX_CUBE_MAP_TEXTURE_SIZE",
  "MAX_FRAGMENT_UNIFORM_VECTORS",
  "MAX_RENDERBUFFER_SIZE",
  "MAX_TEXTURE_IMAGE_UNITS",
  "MAX_TEXTURE_SIZE",
  "MAX_VARYING_VECTORS",
  "MAX_VERTEX_ATTRIBS",
  "MAX_VERTEX_TEXTURE_IMAGE_UNITS",
  "MAX_VERTEX_UNIFORM_VECTORS",
  "MAX_VIEWPORT_DIMS",
  "MEDIUM_FLOAT",
  "MEDIUM_INT",
  "MIRRORED_REPEAT",
  "NEAREST",
  "NEAREST_MIPMAP_LINEAR",
  "NEAREST_MIPMAP_NEAREST",
  "NEVER",
  "NICEST",
  "NONE",
  "NOTEQUAL",
  "NO_ERROR",
  "NUM_COMPRESSED_TEXTURE_FORMATS",
  "ONE",
  "ONE_MINUS_CONSTANT_ALPHA",
  "ONE_MINUS_CONSTANT_COLOR",
  "ONE_MINUS_DST_ALPHA",
  "ONE_MINUS_DST_COLOR",
  "ONE_MINUS_SRC_ALPHA",
  "ONE_MINUS_SRC_COLOR",
  "OUT_OF_MEMORY",
  "PACK_ALIGNMENT",
  "POINTS",
  "POLYGON_OFFSET_FACTOR",
  "POLYGON_OFFSET_FILL",
  "POLYGON_OFFSET_UNITS",
  "RED_BITS",
  "RENDERBUFFER",
  "RENDERBUFFER_ALPHA_SIZE",
  "RENDERBUFFER_BINDING",
  "RENDERBUFFER_BLUE_SIZE",
  "RENDERBUFFER_DEPTH_SIZE",
  "RENDERBUFFER_GREEN_SIZE",
  "RENDERBUFFER_HEIGHT",
  "RENDERBUFFER_INTERNAL_FORMAT",
  "RENDERBUFFER_RED_SIZE",
  "RENDERBUFFER_STENCIL_SIZE",
  "RENDERBUFFER_WIDTH",
  "RENDERER",
  "REPEAT",
  "REPLACE",
  "RGB",
  "RGB5_A1",
  "RGB565",
  "RGBA",
  "RGBA4",
  "SAMPLER_2D",
  "SAMPLER_CUBE",
  "SAMPLES",
  "SAMPLE_ALPHA_TO_COVERAGE",
  "SAMPLE_BUFFERS",
  "SAMPLE_COVERAGE",
  "SAMPLE_COVERAGE_INVERT",
  "SAMPLE_COVERAGE_VALUE",
  "SCISSOR_BOX",
  "SCISSOR_TEST",
  "SHADER_COMPILER",
  "SHADER_SOURCE_LENGTH",
  "SHADER_TYPE",
  "SHADING_LANGUAGE_VERSION",
  "SHORT",
  "SRC_ALPHA",
  "SRC_ALPHA_SATURATE",
  "SRC_COLOR",
  "STATIC_DRAW",
  "STENCIL_ATTACHMENT",
  "STENCIL_BACK_FAIL",
  "STENCIL_BACK_FUNC",
  "STENCIL_BACK_PASS_DEPTH_FAIL",
  "STENCIL_BACK_PASS_DEPTH_PASS",
  "STENCIL_BACK_REF",
  "STENCIL_BACK_VALUE_MASK",
  "STENCIL_BACK_WRITEMASK",
  "STENCIL_BITS",
  "STENCIL_BUFFER_BIT",
  "STENCIL_CLEAR_VALUE",
  "STENCIL_FAIL",
  "STENCIL_FUNC",
  "STENCIL_INDEX",
  "STENCIL_INDEX8",
  "STENCIL_PASS_DEPTH_FAIL",
  "STENCIL_PASS_DEPTH_PASS",
  "STENCIL_REF",
  "STENCIL_TEST",
  "STENCIL_VALUE_MASK",
  "STENCIL_WRITEMASK",
  "STREAM_DRAW",
  "SUBPIXEL_BITS",
  "TEXTURE",
  "TEXTURE0",
  "TEXTURE1",
  "TEXTURE2",
  "TEXTURE3",
  "TEXTURE4",
  "TEXTURE5",
  "TEXTURE6",
  "TEXTURE7",
  "TEXTURE8",
  "TEXTURE9",
  "TEXTURE10",
  "TEXTURE11",
  "TEXTURE12",
  "TEXTURE13",
  "TEXTURE14",
  "TEXTURE15",
  "TEXTURE16",
  "TEXTURE17",
  "TEXTURE18",
  "TEXTURE19",
  "TEXTURE20",
  "TEXTURE21",
  "TEXTURE22",
  "TEXTURE23",
  "TEXTURE24",
  "TEXTURE25",
  "TEXTURE26",
  "TEXTURE27",
  "TEXTURE28",
  "TEXTURE29",
  "TEXTURE30",
  "TEXTURE31",
  "TEXTURE_2D",
  "TEXTURE_BINDING_2D",
  "TEXTURE_BINDING_CUBE_MAP",
  "TEXTURE_CUBE_MAP",
  "TEXTURE_CUBE_MAP_NEGATIVE_X",
  "TEXTURE_CUBE_MAP_NEGATIVE_Y",
  "TEXTURE_CUBE_MAP_NEGATIVE_Z",
  "TEXTURE_CUBE_MAP_POSITIVE_X",
  "TEXTURE_CUBE_MAP_POSITIVE_Y",
  "TEXTURE_CUBE_MAP_POSITIVE_Z",
  "TEXTURE_MAG_FILTER",
  "TEXTURE_MIN_FILTER",
  "TEXTURE_WRAP_S",
  "TEXTURE_WRAP_T",
  "TRIANGLES",
  "TRIANGLE_FAN",
  "TRIANGLE_STRIP",
  "UNPACK_ALIGNMENT",
  "UNPACK_COLORSPACE_CONVERSION_WEBGL",
  "UNPACK_FLIP_Y_WEBGL",
  "UNPACK_PREMULTIPLY_ALPHA_WEBGL",
  "UNSIGNED_BYTE",
  "UNSIGNED_INT",
  "UNSIGNED_SHORT",
  "UNSIGNED_SHORT_4_4_4_4",
  "UNSIGNED_SHORT_5_5_5_1",
  "UNSIGNED_SHORT_5_6_5",
  "VALIDATE_STATUS",
  "VENDOR",
  "VERSION",
  "VERTEX_ATTRIB_ARRAY_BUFFER_BINDING",
  "VERTEX_ATTRIB_ARRAY_ENABLED",
  "VERTEX_ATTRIB_ARRAY_NORMALIZED",
  "VERTEX_ATTRIB_ARRAY_POINTER",
  "VERTEX_ATTRIB_ARRAY_SIZE",
  "VERTEX_ATTRIB_ARRAY_STRIDE",
  "VERTEX_ATTRIB_ARRAY_TYPE",
  "VERTEX_SHADER",
  "VIEWPORT",
  "ZERO",
];
