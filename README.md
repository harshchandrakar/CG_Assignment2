# WebGL 3D Model Renderer

A sophisticated 3D model viewer and animator built with WebGL that features model manipulation, multiple view modes, and animation along quadratic paths.

## 🚀 Features

- **3D Model Rendering**: Display custom-made Blender models (cup, cube, and custom model)
- **Dual View Modes**:
  - Top View (Orthographic projection)
  - 3D View (Perspective projection with camera rotation)
- **Object Manipulation**:
  - Translation along quadratic Bézier paths
  - Quaternion-based rotation to avoid gimbal lock
  - Dynamic scaling
  - Object picking via ray casting
- **Path Animation**: Smooth interpolation with adjustable speed
- **World Axes**: RGB colored axis indicators for spatial reference

## 📋 Prerequisites

- Modern web browser with WebGL support (Chrome recommended)
- Visual Studio Code with Live Server extension

## 🔧 Setup & Running

1. Clone this repository
2. Open the project folder in VS Code
3. Right-click on `index.html` and select "Open with Live Server"
4. The application will open in your default browser (Chrome recommended)

## 🎮 Controls

### View Modes
- **T**: Switch to Top View (orthographic projection along z-axis)
- **Y**: Switch to 3D View (perspective projection)

### Object Manipulation
- **Mouse Click**: Select an object (highlighted in orange)
- **Arrow Keys**:
  - **↑**: Rotate selected object about X-axis
  - **←**: Rotate selected object about Y-axis
  - **→**: Rotate selected object about Z-axis
- **S**: Scale up selected object
- **X**: Scale down selected object

### Path Animation
- **M**: Start path drawing mode
- **R**: Reset path
- **[** / **]**: Decrease/Increase animation speed

### Camera Controls
- **Mouse Drag** (in 3D View): Rotate camera (virtual trackball)

## 🏗️ Technical Implementation

### 3D Models
Models were created in Blender using boolean operations and exported as `.obj` files, then loaded using `webgl-objloader`.

### View System
- **Top View**: Camera positioned at (0, 5, 0) looking at origin
- **3D View**: Virtual trackball implementation using spherical coordinates

### Object Picking
- Ray casting technique to detect object selection
- Screen-to-World coordinate mapping using inverse view-projection matrices

### Path Animation
- Quadratic Bézier curve implementation: `p(t)=(1−t)²p₀+2(1−t)tp₁+t²p₂`
- 100 sample points for smooth interpolation

### Transformations
- Quaternion-based rotations using gl-matrix library
- Matrix composition order: Translate → Rotate → Scale

## 🎥 Demo

Watch a demonstration video of the application: [YouTube Demo](https://youtu.be/KOg3IvJoAdE)

## 🧰 Technologies Used

- WebGL for 3D rendering
- gl-matrix library for matrix and quaternion operations
- Custom shader implementation for rendering and lighting
- WebGL OBJ Loader for importing 3D models

## 📚 Project Structure

```
.
├── README.md
├── Report.pdf
├── index.html
├── js
│   ├── app.js
│   ├── obj-loader.js
│   ├── object-movement.js
│   ├── renderer.js
│   ├── shader-loader.js
│   └── view-manager.js
├── media
│   ├── CG_Assignment_2_demo.mp4
│   ├── Screenshot 2025-04-06 at 11.49.57 AM.png
│   ├── Screenshot 2025-04-06 at 11.53.14 AM.png
│   ├── Screenshot 2025-04-06 at 11.55.26 AM.png
│   ├── Screenshot 2025-04-06 at 11.56.45 AM.png
│   ├── Screenshot 2025-04-06 at 11.58.32 AM.png
│   └── Screenshot 2025-04-06 at 12.01.54 PM.png
├── models
│   ├── arrow1.obj
│   ├── cube.obj
│   ├── cup4.obj
│   ├── random.obj
│   ├── random1.obj
│   └── random2.obj
├── shaders
│   ├── fragment-shader.glsl
│   └── vertex-shader.glsl
└── video
```

The `media` folder contains demonstration video and screenshots of the application in action, showcasing different features and view modes.

## 🔍 Further Development

Future enhancements could include:
- Support for more complex spline-based paths for n > 3 points
- Additional material and texture support
- Physics-based interactions between models
- Support for more complex 3D model formats