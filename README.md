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

- `index.html`: Main entry point
- `js/`
  - `ShaderLoader.js`: Handles shader loading and compilation
  - `VirtualTrackball.js`: Implements camera rotation functionality
  - `ViewManager.js`: Manages different view modes
  - `OBJLoader.js`: Loads and parses 3D models
  - `Renderer.js`: Handles WebGL rendering pipeline
  - `main.js`: Core application logic

## 🔍 Further Development

Future enhancements could include:
- Support for more complex spline-based paths for n > 3 points
- Additional material and texture support
- Physics-based interactions between models
- Support for more complex 3D model formats