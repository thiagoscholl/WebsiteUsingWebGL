"use strict";

// This is not a full .obj parser.
// see http://paulbourke.net/dataformats/obj/

function degToRad(deg) {
  return deg * Math.PI / 180;
}
function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];
  const objColors = [[0, 0, 0]];
  

  // same order as `f` indices
  const objVertexData = [objPositions, objTexcoords, objNormals, objColors];

  // same order as `f` indices
  let webglVertexData = [
    [], // positions
    [], // texcoords
    [], // normals
    [], // colors
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ["default"];
  let material = "default";
  let object = "default";

  const noop = () => {};

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      const color = [];
      webglVertexData = [position, texcoord, normal, color];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
          color,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split("/");
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
      // if this is the position index (index 0) and we parsed
      // vertex colors then copy the vertex colors to the webgl vertex color data
      if (i === 0 && objColors.length > 1) {
        geometry.data.color.push(...objColors[index]);
      }
    });
  }

  const keywords = {
    v(parts) {
      // if there are more than 3 values here they are vertex colors
      if (parts.length > 3) {
        objPositions.push(parts.slice(0, 3).map(parseFloat));
        objColors.push(parts.slice(3).map(parseFloat));
      } else {
        objPositions.push(parts.map(parseFloat));
      }
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop, // smoothing group
    mtllib(parts, unparsedArgs) {
      // the spec says there can be multiple filenames here
      // but many exist with spaces in a single filename
      materialLibs.push(unparsedArgs);
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split("\n");
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn("unhandled keyword:", keyword); // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
      Object.entries(geometry.data).filter(([, array]) => array.length > 0)
    );
  }

  return {
    geometries,
    materialLibs,
  };
}

function parseMapArgs(unparsedArgs) {
  // TODO: handle options
  return unparsedArgs;
}

function parseMTL(text) {
  const materials = {};
  let material;

  const keywords = {
    newmtl(parts, unparsedArgs) {
      material = {};
      materials[unparsedArgs] = material;
    },
    /* eslint brace-style:0 */
    Ns(parts) {
      material.shininess = parseFloat(parts[0]);
    },
    Ka(parts) {
      material.ambient = parts.map(parseFloat);
    },
    Kd(parts) {
      material.diffuse = parts.map(parseFloat);
    },
    Ks(parts) {
      material.specular = parts.map(parseFloat);
    },
    Ke(parts) {
      material.emissive = parts.map(parseFloat);
    },
    map_Kd(parts, unparsedArgs) {
      material.diffuseMap = parseMapArgs(unparsedArgs);
    },
    map_Ns(parts, unparsedArgs) {
      material.specularMap = parseMapArgs(unparsedArgs);
    },
    map_Bump(parts, unparsedArgs) {
      material.normalMap = parseMapArgs(unparsedArgs);
    },
    Ni(parts) {
      material.opticalDensity = parseFloat(parts[0]);
    },
    d(parts) {
      material.opacity = parseFloat(parts[0]);
    },
    illum(parts) {
      material.illum = parseInt(parts[0]);
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split("\n");
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn("unhandled keyword:", keyword); // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  return materials;
}

async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById("canvasPole360");
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }

  // Tell the twgl to match position with a_position etc..
  twgl.setAttributePrefix("a_");

  const vs = `#version 300 es
  in vec4 a_position;
  in vec3 a_normal;
  in vec2 a_texcoord;
  in vec4 a_color;
  uniform mat4 u_projection;
  uniform mat4 u_view;
  uniform mat4 u_world;
  uniform vec3 u_viewWorldPosition;
  out vec3 v_normal;
  out vec3 v_surfaceToView;
  out vec2 v_texcoord;
  out vec4 v_color;


  void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
    v_normal = mat3(u_world) * a_normal;
    v_texcoord = a_texcoord;
    v_color = a_color;

  }
  `;

  const fs = `#version 300 es
  precision highp float;
  in vec3 v_normal;
  in vec3 v_surfaceToView;
  in vec2 v_texcoord;
  in vec4 v_color;
  uniform vec3 diffuse;
  uniform sampler2D diffuseMap;
  uniform vec3 ambient;
  uniform vec3 emissive;
  uniform vec3 specular;
  uniform sampler2D specularMap;
  uniform float shininess;
  uniform float opacity;
  uniform vec3 u_lightDirection;
  uniform vec3 u_ambientLight;
  out vec4 outColor;
  void main () {
    vec3 normal = normalize(v_normal);
    vec3 surfaceToViewDirection = normalize(v_surfaceToView);
    vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);
    float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
    float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);
    vec4 specularMapColor = texture(specularMap, v_texcoord);
    vec3 effectiveSpecular = specular * specularMapColor.rgb;
    vec4 diffuseMapColor = texture(diffuseMap, v_texcoord);
    vec3 effectiveDiffuse = diffuse * diffuseMapColor.rgb * v_color.rgb;
    float effectiveOpacity = opacity * diffuseMapColor.a * v_color.a;
    outColor = vec4(
      emissive +
        ambient * u_ambientLight +
        effectiveDiffuse * fakeLight +
        effectiveSpecular * pow(specularLight, shininess),
        effectiveOpacity);
      }
  `;
  
  // compiles and links the shaders, looks up attribute and uniform locations
  const meshProgramInfo = twgl.createProgramInfo(gl, [vs, fs]);
  
  

  const geometries = [];
  
  const cameraTarget = [0, 0.4, 0];;
  var yRotation = degToRad(0);
  var xRotation = degToRad(0);
  const radius = 1.5;
  
  const extents = getGeometriesExtents(geometries);
  const range = m4.subtractVectors(extents.max, extents.min);
  // amount to move the object so its center is at the origin
  const objOffset = m4.scaleVector(
    m4.addVectors(
      extents.min,
      m4.scaleVector(range, 0.5)),
      -1);
      
      const cameraPosition = m4.addVectors(cameraTarget, [
        0,
        0,
        radius,
      ]);

      //inputs range
      const zoom = document.getElementById("zoom2");
      zoom.addEventListener("input", () => {
        const val = parseInt(zoom.value) * -0.05 + radius;
        cameraPosition[2] = val;
      });
      
      const rotY = document.getElementById("roty2");
      rotY.addEventListener("input", () => {
        const val = degToRad(parseInt(rotY.value));
        yRotation = val;
      });
      
      const rotX = document.getElementById("rotx2");
      rotX.addEventListener("input", () => {
        const val = degToRad(parseInt(rotX.value));
        xRotation = val;
      });



      //var index = 1;
      //loadTexture(index)
    
      var botaoblack = document.getElementById("blacktex2");
      botaoblack.addEventListener("click", function() {
        loadTexture(1);
      });

      var botaored = document.getElementById("redtex2");
      botaored.addEventListener("click", function() {
        loadTexture(2);
      });

      //await loadTexture();
      
      //const objHref = "./obj/speedrecaro/source/Recaro.obj";
      //const response = await fetch(objHref);
      //const text = await response.text();
      //const obj = parseOBJ(text);
      async function loadTexture(index) {
        
        const objHref = "./obj/poleposition/source/poleposition.obj";
        const response = await fetch(objHref);
        const text = await response.text();
        const obj = parseOBJ(text);
    
    
        const baseHref = new URL(objHref, window.location.href);
        
        //if (blackbtn) {

          const matTexts = await Promise.all(
            obj.materialLibs.map(async (filename) => {

            const response = await fetch("./obj/poleposition/source/poleposition" + index + ".mtl");
            //const response = await fetch("./obj/speedrecaro/source/Recaro.mtl");
            return await response.text();
          })
          );
          console.log(matTexts)
          const materials = parseMTL(matTexts.join("\n"));  
          

          
          
          //const baseHref = new URL(objHref, window.location.href);
          //const matTexts = await Promise.all(
    //  obj.materialLibs.map(async (filename) => {
    //    const response = await fetch("./obj/speedrecaro/source/Recaro.mtl");
    //    return await response.text();
     // })
    //);
    //const materials = parseMTL(matTexts.join("\n"));
    
    const textures = {
      defaultWhite: twgl.createTexture(gl, { src: [255, 255, 255, 255] }),
    };
    
    // load texture for materials
    for (const material of Object.values(materials)) {
      Object.entries(material)
        .filter(([key]) => key.endsWith("Map"))
        .forEach(([key, filename]) => {
          let texture = textures[filename];
          if (!texture) {
            const textureHref = new URL(filename, baseHref).href;
            texture = twgl.createTexture(gl, { src: textureHref, flipY: true });
            textures[filename] = texture;
          }
          material[key] = texture;
        });
    }
    
    // hack the materials so we can see the specular map
    Object.values(materials).forEach((m) => {
      m.shininess = 25;
      m.specular = [3, 2, 1];
    });
    
    const defaultMaterial = {
      diffuse: [1, 1, 1],
      diffuseMap: textures.defaultWhite,
      ambient: [0, 0, 0],
      specular: [1, 1, 1],
      specularMap: textures.defaultWhite,
      shininess: 400,
      opacity: 1,
    };
    
    const parts = obj.geometries.map(({ material, data }) => {
      // Because data is just named arrays like this
      //
      // {
      //   position: [...],
      //   texcoord: [...],
      //   normal: [...],
      // }
      //
      // and because those names match the attributes in our vertex
      // shader we can pass it directly into `createBufferInfoFromArrays`
      // from the article "less code more fun".
    
      if (data.color) {
        if (data.position.length === data.color.length) {
          // it's 3. The our helper library assumes 4 so we need
          // to tell it there are only 3.
          data.color = { numComponents: 3, data: data.color };
        }
      } else {
        // there are no vertex colors so just use constant white
        data.color = { value: [1, 1, 1, 1] };
      }
    
      // create a buffer for each array by calling
      // gl.createBuffer, gl.bindBuffer, gl.bufferData
      const bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
      const vao = twgl.createVAOFromBufferInfo(gl, meshProgramInfo, bufferInfo);

      return {
        material: {
          ...defaultMaterial,
          ...materials[material],
        },
        bufferInfo,
        vao,
      };
    });
    
    function render(time) {
      time *= 0.001;  // convert to seconds
    
    
      twgl.resizeCanvasToDisplaySize(gl.canvas);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.enable(gl.DEPTH_TEST);
    
      const fieldOfViewRadians = degToRad(60);
      const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
      const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);
    
      const up = [0, 1, 0];
      // Compute the camera's matrix using look at.
      const camera = m4.lookAt(cameraPosition, cameraTarget, up);
    
      // Make a view matrix from the camera matrix.
      const view = m4.inverse(camera);
    
      const sharedUniforms = {
        u_lightDirection: m4.normalize([-1, 3, 5]),
        u_view: view,
        u_projection: projection,
        u_viewWorldPosition: cameraPosition,
      };
    
      gl.useProgram(meshProgramInfo.program);
    
      // calls gl.uniform
      twgl.setUniforms(meshProgramInfo, sharedUniforms);
    
      // compute the world matrix once since all parts
      // are at the same space.
      let u_world = m4.identity();
      u_world = m4.translate(u_world, ...objOffset);
      u_world = m4.yRotation(yRotation - 1.6);
      u_world = m4.multiply(m4.xRotation(xRotation), u_world);
      
      
      for (const { bufferInfo, vao, material } of parts) {
        // set the attributes for this part.
        gl.bindVertexArray(vao);
        // calls gl.uniform
        twgl.setUniforms(
          meshProgramInfo,
          {
            u_world,
          },
          material
          );
          // calls gl.drawArrays or gl.drawElements
          twgl.drawBufferInfo(gl, bufferInfo);
        }
        
        requestAnimationFrame(render);
      }
      
      //var radius = 8
    
      const zNear = radius / 100;
      const zFar = radius * 3;
    
    
    requestAnimationFrame(render);
    
  } 
  
  function getExtents(positions) {
    const min = positions.slice(0, 3);
    const max = positions.slice(0, 3);
    for (let i = 3; i < positions.length; i += 3) {
      for (let j = 0; j < 3; ++j) {
        const v = positions[i + j];
        min[j] = Math.min(v, min[j]);
        max[j] = Math.max(v, max[j]);
      }
    }
    return { min, max };
  }
  
  function getGeometriesExtents(geometries) {
    return geometries.reduce(
      ({ min, max }, { data }) => {
        const minMax = getExtents(data.position);
        return {
          min: min.map((min, ndx) => Math.min(minMax.min[ndx], min)),
          max: max.map((max, ndx) => Math.max(minMax.max[ndx], max)),
        };
      },
      {
        min: Array(3).fill(Number.POSITIVE_INFINITY),
        max: Array(3).fill(Number.NEGATIVE_INFINITY),
      }
    );
  }
  


};



var m3 = {
    translation: function translation(tx, ty) {
      return [
        1, 0, 0,
        0, 1, 0,
        tx, ty, 1,
      ];
    },
  
    rotation: function rotation(angleInRadians) {
      var c = Math.cos(angleInRadians);
      var s = Math.sin(angleInRadians);
      return [
        c, -s, 0,
        s, c, 0,
        0, 0, 1,
      ];
    },
  
    scaling: function scaling(sx, sy) {
      return [
        sx, 0, 0,
        0, sy, 0,
        0, 0, 1,
      ];
    },
  
    multiply: function multiply(a, b) {
      var a00 = a[0 * 3 + 0];
      var a01 = a[0 * 3 + 1];
      var a02 = a[0 * 3 + 2];
      var a10 = a[1 * 3 + 0];
      var a11 = a[1 * 3 + 1];
      var a12 = a[1 * 3 + 2];
      var a20 = a[2 * 3 + 0];
      var a21 = a[2 * 3 + 1];
      var a22 = a[2 * 3 + 2];
      var b00 = b[0 * 3 + 0];
      var b01 = b[0 * 3 + 1];
      var b02 = b[0 * 3 + 2];
      var b10 = b[1 * 3 + 0];
      var b11 = b[1 * 3 + 1];
      var b12 = b[1 * 3 + 2];
      var b20 = b[2 * 3 + 0];
      var b21 = b[2 * 3 + 1];
      var b22 = b[2 * 3 + 2];
      return [
        b00 * a00 + b01 * a10 + b02 * a20,
        b00 * a01 + b01 * a11 + b02 * a21,
        b00 * a02 + b01 * a12 + b02 * a22,
        b10 * a00 + b11 * a10 + b12 * a20,
        b10 * a01 + b11 * a11 + b12 * a21,
        b10 * a02 + b11 * a12 + b12 * a22,
        b20 * a00 + b21 * a10 + b22 * a20,
        b20 * a01 + b21 * a11 + b22 * a21,
        b20 * a02 + b21 * a12 + b22 * a22,
      ];
    },
  };

main();





