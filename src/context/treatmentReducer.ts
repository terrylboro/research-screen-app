import { TreatmentState, Action, TreatmentStage } from '../types/treatmentTypes';
import useSound from "use-sound"

// const HOLD_DURATION_MS = 5000;
const ONE_MILLISECOND = 1000;
// For audio

function resetTimerProgress(state: TreatmentState): TreatmentState {
  return {
    ...state,
    lastTickTime: null,
    isAligned: false,
    timerOn: false,
    timerElapsedTime: 0,
    stageProgress: 0,
  };
}


export const initialState: TreatmentState = {
  stage: TreatmentStage.STAGE_1,
  affectedCanal: 'posterior',
  affectedEar: null,
  isAligned: false,
  // holdStartTime: null,
  lastTickTime: null,
  holdDurationSec: 45,
  timerOn: false,
  timerElapsedTime : 0,
  stageProgress: 0,
};

export function treatmentReducer(
  state: TreatmentState,
  action: Action
): TreatmentState {
  switch (action.type) {
    case 'SELECT_CANAL':
      return { ...state, affectedCanal: action.canal };

    case 'SELECT_EAR':
      return { ...state, affectedEar: action.ear };

    case 'TOGGLE_ALIGNED':
      return { ...state, isAligned: !state.isAligned };

    case 'SET_HOLD_DURATION':
      return { ...state, holdDurationSec: action.holdDuration};

    case 'ALIGNMENT_ENTER':
      if (state.stage !== TreatmentStage.COMPLETE) {
        return { ...state, isAligned: true, timerOn: true };
      }
      else return { ...state, stageProgress: 1 };

    case 'ALIGNMENT_EXIT':
      if (state.stage !== TreatmentStage.COMPLETE) {
        return { ...state, isAligned: false, timerOn: false };
      }
      else return { ...state, stageProgress: 1 };

    case 'PROGRESS':
      return resetTimerProgress({
        ...state,
        stage: (state.stage < 3) ? (state.stage + 1) : TreatmentStage.COMPLETE,
      });

    case 'RETURN_TO_PREVIOUS_STAGE':
      return resetTimerProgress({
        ...state,
        stage: (state.stage > 0) ? (state.stage - 1) : TreatmentStage.STAGE_1,
      });

    case 'TIMER_TICK': {
      if (state.lastTickTime === null) {
        return { ...state, lastTickTime: action.now } 
      }

      if (state.stage === TreatmentStage.COMPLETE) {
          return { ...state, stageProgress: 1, lastTickTime: action.now };
      }

      const dt = action.now - state.lastTickTime;

      const nextElapsed = state.isAligned ? state.timerElapsedTime + dt : state.timerElapsedTime;

      const nextProgress = Math.min((nextElapsed) / (state.holdDurationSec*ONE_MILLISECOND), 1);

      if (nextProgress === 1 ) {
        if (state.stage === TreatmentStage.STAGE_4) {
          return {
            ...state,
            stage: TreatmentStage.COMPLETE,
            lastTickTime: action.now,
            isAligned: false,
            timerOn: false,
            timerElapsedTime: state.holdDurationSec * ONE_MILLISECOND,
            stageProgress: 1,
          };
        }

        return {
          ...state,
          lastTickTime: action.now,
          timerOn: false,
          timerElapsedTime: state.holdDurationSec * ONE_MILLISECOND,
          stageProgress: 1,
        };
      }
      else {
        return {
        ...state,
        timerElapsedTime: nextElapsed,
        stageProgress: nextProgress,
        lastTickTime: action.now,
      };
      }
      


      // if (state.holdStartTime && state.timerOn) {
      //   const elapsed = (action.now - state.holdStartTime);
      //   if (elapsed + state.timerElapsedTime >= state.holdDurationSec*ONE_MILLISECOND) {
      //     return { ...state, stage: (state.stage < 3) ? (state.stage + 1) : TreatmentStage.COMPLETE, holdStartTime: null, isAligned: false, stageProgress: 0, timerElapsedTime: 0 };
      //   }
      //   return { ...state, stageProgress: elapsed / (state.holdDurationSec*ONE_MILLISECOND), timerElapsedTime: elapsed };
      // }
      // return state;
    }

    case 'RESET_PROGRESS':
      return { ...state, stage: TreatmentStage.STAGE_1, lastTickTime: null, stageProgress: 0, isAligned: false,};

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}
