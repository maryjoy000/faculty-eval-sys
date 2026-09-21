// ============================================
// SHARED DATA: Score Weighting Configuration
// ============================================

const DEFAULT_WEIGHTING = {
  classroomObservation: 70,
  domain6Share: 75,
  domain7Share: 25,
  peerShareOfDomain6: 50,
  studentShareOfDomain6: 50
};

let weightingCache = {
  ...DEFAULT_WEIGHTING
};

async function loadWeighting() {
  try {
    const response = await fetch(
      "http://127.0.0.1:5000/api/evaluation-weightings",
      {
        credentials: "include"
      }
    );

    if (!response.ok) {
      throw new Error("Failed to load weighting");
    }

    const data = await response.json();

    weightingCache = {
      classroomObservation: Number(data.classroom_observation_pct),
      domain6Share: Number(data.domain6_share_pct),
      domain7Share: Number(data.domain7_share_pct),
      peerShareOfDomain6: Number(data.peer_share_of_domain6_pct),
      studentShareOfDomain6: Number(data.student_share_of_domain6_pct)
    };

    return weightingCache;
  } catch (error) {
    console.error("Failed to load weighting:", error);
    return weightingCache;
  }
}

function getWeighting() {
  return weightingCache;
}

async function saveWeighting(weighting) {
  const response = await fetch(
    "http://127.0.0.1:5000/api/evaluation-weightings",
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        classroom_observation_pct: weighting.classroomObservation,
        domain6_share_pct: weighting.domain6Share,
        domain7_share_pct: weighting.domain7Share,
        peer_share_of_domain6_pct: weighting.peerShareOfDomain6,
        student_share_of_domain6_pct: weighting.studentShareOfDomain6
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error || "Failed to save weighting"
    );
  }

  weightingCache = {
    classroomObservation: Number(data.classroom_observation_pct),
    domain6Share: Number(data.domain6_share_pct),
    domain7Share: Number(data.domain7_share_pct),
    peerShareOfDomain6: Number(data.peer_share_of_domain6_pct),
    studentShareOfDomain6: Number(data.student_share_of_domain6_pct)
  };

  return weightingCache;
}

function getEffectiveWeights() {
  const w = getWeighting();

  const nonClassroom = 100 - w.classroomObservation;

  const domain6 =
    nonClassroom * (w.domain6Share / 100);

  const domain7 =
    nonClassroom * (w.domain7Share / 100);

  return {
    classroomObservation: w.classroomObservation,
    student:
      domain6 * (w.studentShareOfDomain6 / 100),
    peerToPeer:
      domain6 * (w.peerShareOfDomain6 / 100),
    hrEvaluation: domain7
  };
}

function calculateWeightedAverage(scoresByType) {
  const weights = getEffectiveWeights();

  const availableEntries = Object.entries(
    scoresByType
  ).filter(([, score]) => score !== null);

  if (availableEntries.length === 0) {
    return null;
  }

  const totalAvailableWeight =
    availableEntries.reduce(
      (sum, [type]) => sum + (weights[type] || 0),
      0
    );

  if (totalAvailableWeight === 0) {
    return null;
  }

  const weightedSum =
    availableEntries.reduce(
      (sum, [type, score]) =>
        sum + score * (weights[type] || 0),
      0
    );

  return weightedSum / totalAvailableWeight;
}