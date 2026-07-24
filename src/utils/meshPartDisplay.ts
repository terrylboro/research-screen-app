import { TreatmentStage, CanalType } from "../types/treatmentTypes";

export type HighlightedMeshPart = {
  colourName: "red" | "green";
  partName: string;
  partNumber: number | "all";
};

const formatCanalName = (canal: CanalType | null) => {
  if (!canal) return "No canal";
  return canal.charAt(0).toUpperCase() + canal.slice(1);
};

export const getHighlightedMeshPart = (
  canal: CanalType | null,
  stage: TreatmentStage,
  isAligned: boolean,
  completeHighlightsAll = false
): HighlightedMeshPart => {
  const colourName =
    completeHighlightsAll && stage === TreatmentStage.COMPLETE
      ? "green"
      : isAligned
        ? "green"
        : "red";
  const canalName = formatCanalName(canal);

  if (completeHighlightsAll && stage === TreatmentStage.COMPLETE) {
    return {
      colourName,
      partName: `${canalName} all mesh parts`,
      partNumber: "all",
    };
  }

  const partNumber = stage === TreatmentStage.COMPLETE ? 4 : stage + 1;

  return {
    colourName,
    partName: `${canalName}_${partNumber}`,
    partNumber,
  };
};
