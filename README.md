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

IMU processing uses the NHS-style firmware scaling and Mahony filter (gain 1.5,
acceleration gate 0.85–1.15 g). Notifications are processed directly, with valid
device packet intervals divided equally across all chronological frames. The
nominal mount is central forehead: filter axes are [sensor Z, -sensor Y, sensor X].
Ear selection affects treatment/display choices, not sensor coordinates. Existing
guided IMU calibration and forward-zero controls are available. Calibrate gyroscope
opens the NHS-style still/nod/shake popup. Adaptive bias tracking is not enabled.

JSON format version 3 retains the existing fields and records every raw frame.
receivedAt and elapsedMs retain browser-arrival semantics (shared within a packet).
sensorTimelineMs accumulates valid device intervals; frameIntervalMs is null at
startup, reconnect or a discontinuity. timingDiscontinuity flags those rows.
Only the newest frame updates fusion with dt=0 on such packets; earlier rows hold
the previous pose and have fusionUpdated=false. Device-time gaps are not integrated;
use arrival times and packet metadata when analysing missing time. Renderers apply
the latest fused, zero-offset pose directly without presentation smoothing.

Core maths were ported from the local headspin_nhs_style project. Tests cover
packet scaling, rollover/discontinuities, angular velocity, gravity rejection and
multi-packet acquisition through the provider into the research JSON download.

The ResearchScreen orientation readout ports HeadspinVerification's unconstrained
HeadKinematics.calculate() with its default axes/signs: X lateral flexion, Y
flexion, Z axial rotation. It uses inverse(recentered pose) * current pose, the
same relative quaternion as the models. Flexion is atan2(headAxis.x, headAxis.z),
lateral flexion is atan2(-headAxis.y, hypot(headAxis.x, headAxis.z)), and axial
rotation is the signed Z-axis twist in [-180, 180). Singular swing-twist poses
show an unavailable readout. Recenter head selects the live neutral pose; it does
not average a neutral sample window as the offline verification pipeline does.
The displayed angles do not replace the existing Euler fields in recordings.

Recording exports default to CSV; enable “Save as JSON” to download the JSON
container instead. Both include flexionDegrees, axialRotationDegrees and
lateralFlexionDegrees for every sample, using the same quaternion calculation
and current sign convention as the live display. Undefined angles are empty CSV
cells or JSON nulls. JSON format version 3 retains session metadata; CSV contains
one header row and one row per IMU sample, including all existing sample fields.


Calibration popup: mount the sensor centrally on the forehead, then press Start
calibration. After three seconds of settling it records three seconds of
stillness, detects two nods and two shakes, and repeats failed checks. Movement
steps allow 30 seconds and may request a third cycle when axes disagree. The
same NHS movement-axis analysis and stillness thresholds are used. Once all
checks pass, gyro bias and the sensor-to-anatomical matrix are installed and
fusion restarts in the calibrated basis. Look straight ahead and press Finish
calibration to recentre and return to research. This does not start a recording.
Gyro bias is stored locally; mounting calibration is retained for the session.

Treatment hold timing and device-button treatment navigation pause while the
popup is open. Device Progress starts/finishes calibration; device Go Back
cancels the popup. Closing or disconnecting cancels pending timers and retries.
Calibration is unavailable while a research recording is active. Cancelling
before the checks pass leaves the previous calibration in place; after they pass,
the validated bias/matrix are already applied even if the popup is then closed.
