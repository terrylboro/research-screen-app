# HeadSpin Research Screen

This is a standalone extraction of the original app's Research Screen. It includes:

- Web Bluetooth connection and IMU notification handling
- orientation filtering and CSV recording
- live roll, pitch, and yaw charting
- Three.js head and canal mesh visualization
- canal alignment, stage controls, timer, and webcam preview

## Run

From this directory:

```powershell
npm install
npm start
```

Open the local URL in Chrome or Edge. Web Bluetooth requires a secure context; `localhost`
is accepted during development. Select the ear and canal, then click **Connect Bluetooth**.

The app expects the same BLE service and characteristics as the original:

- service: `12345678-1234-5678-1234-56789abcdef0`
- IMU: `12345678-1234-5678-1234-56789abcdef2`
- button: `12345678-1234-5678-1234-56789abcdef4`

The mesh and sound assets in `public/` are part of this app and do not depend on the parent app.
