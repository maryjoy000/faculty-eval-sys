// ============================================
// SHARED DATA: Evaluation Criteria (all 4 types)
// ============================================
// Unified structure so one management UI can edit all evaluation types.
// Each type is an array of "parts", each part has a title and questions.
// Defaults below match what was previously hardcoded in each page —
// migrating them here doesn't change any existing behavior, just makes
// them editable instead of fixed in code.

const CRITERIA_TYPES = {
  student: "criteria_student",
  classroomObservation: "criteria_classroomObservation",
  peerToPeer: "criteria_peerToPeer",
  hrEvaluation: "criteria_hrEvaluation"
};

// --- Convert stored newlines to <br> for HTML display; handles legacy <br> too ---
function nlToBr(text) {
  return (text || "").replace(/<br\s*\/?>/gi, "\n").replace(/\n/g, "<br>");
}
// --- Convert any stored <br> back to real newlines, for editing in a textarea ---
function brToNl(text) {
  return (text || "").replace(/<br\s*\/?>/gi, "\n");
}

const DEFAULT_CRITERIA = {
  student: [
    {
      partNumber: 1,
      title: "Part 1: Punctuality and Timeliness <br> The Teacher...",
      questions: [
        { id: "q1", text: "Comes on classes early and dismisses according to the official time of the classes." },
        { id: "q2", text: "Announces important school matters ahead of time." },
        { id: "q3", text: "Administers classroom activities according to the school schedules" },
        { id: "q4", text: "Returns activity, homework, and assignments in a timely manner." }
      ]
    },
    {
      partNumber: 2,
      title: "Part 2: Transparency <br> The Teacher...",
      questions: [
        { id: "q5", text: "Explains to the class how they will be graded on every class standing." },
        { id: "q6", text: "Updates students who have lacking subject requirements for compliance." },
        { id: "q7", text: "Gives grades fairly according to the student's classroom performance." },
        { id: "q8", text: "Clearly states what students should be able to do by the end of a lesson or unit." },
        { id: "q9", text: "Gives feedback to the students performances and outputs including ways to improve." }
      ]
    },
    {
      partNumber: 3,
      title: "Part 3: Mastery <br> The Teacher...",
      questions: [
        { id: "q10", text: "Is well knowledgable with the subject area and understands what he/she is delivering to the class." },
        { id: "q11", text: "Can give easy to understand examples of the topic(s)." },
        { id: "q12", text: "Demonstrates skills to the class with confidence." },
        { id: "q13", text: "Delivers factual (accurate) information in the subject matter." },
        { id: "q14", text: "Provide appropriate examples during teaching hours." },
        { id: "q15", text: "Demonstrates skills needed to be learned by students comprehensively." },
        { id: "q16", text: "Demonstrates ability to organize and execute the lesson." }
      ]
    },
    {
      partNumber: 4,
      title: "Part 4: Grooming and Personality <br> The Teacher...",
      questions: [
        { id: "q17", text: "Is well groomed when coming to class." },
        { id: "q18", text: "Is wearing proper uniform at times." },
        { id: "q19", text: "Welcomes students' inquiries with enthusiasm." },
        { id: "q20", text: "Advices students with academic performances and behavioral problems." },
        { id: "q21", text: "Instructs students responsibility and respect." }
      ]
    },
    {
      partNumber: 5,
      title: "Part 5: Classroom Management <br> The Teacher...",
      questions: [
        { id: "q22", text: "Regularly checks attendance of students." },
        { id: "q23", text: "Gives examinations, activities, and tests which are based on the discussed lessons." },
        { id: "q24", text: "Uses teaching techniques which are suitable for the student understanding." },
        { id: "q25", text: "Encourages students to actively participate in the class discussions." },
        { id: "q26", text: "Promotes classroom cleanliness and orderliness." },
        { id: "q27", text: "Controls students' misbehavior with utmost responsibility." },
        { id: "q28", text: "Encourages students with the proper use of school facilities." },
        { id: "q29", text: "Evaluates and comments students performance fairly." },
        { id: "q30", text: "Gives feedback on students' performances and ways to improve them." },
        { id: "q31", text: "Is creative in developing activities and lessons." },
        { id: "q32", text: "Manages class time well." },
        { id: "q33", text: "Encourages students to participate in class actively." }
      ]
    }
  ],
  classroomObservation: [
    {
      partNumber: 1,
      title: "Domain 1: Content Knowledge and Pedagogy",
      questions: [
        { id: "d1q1", text: "[Placeholder] Demonstrates mastery of the subject matter." },
        { id: "d1q2", text: "[Placeholder] Uses appropriate teaching strategies for the content." },
        { id: "d1q3", text: "[Placeholder] Integrates relevant examples to reinforce learning." },
        { id: "d1q4", text: "[Placeholder] Applies research-based teaching practices." },
        { id: "d1q5", text: "[Placeholder] Utilizes appropriate instructional materials." },
        { id: "d1q6", text: "[Placeholder] Encourages critical and analytical thinking." }
      ]
    },
    {
      partNumber: 2,
      title: "Domain 2: Learning Environment",
      questions: [
        { id: "d2q1", text: "[Placeholder] Maintains a safe and orderly classroom." },
        { id: "d2q2", text: "[Placeholder] Establishes a positive learning atmosphere." },
        { id: "d2q3", text: "[Placeholder] Manages learner behavior constructively." },
        { id: "d2q4", text: "[Placeholder] Optimizes the physical learning environment." },
        { id: "d2q5", text: "[Placeholder] Encourages learner participation and engagement." },
        { id: "d2q6", text: "[Placeholder] Promotes fair and consistent classroom rules." }
      ]
    },
    {
      partNumber: 3,
      title: "Domain 3: Diversity of Learners",
      questions: [
        { id: "d3q1", text: "[Placeholder] Recognizes individual differences among learners." },
        { id: "d3q2", text: "[Placeholder] Adjusts teaching approach for diverse needs." },
        { id: "d3q3", text: "[Placeholder] Provides support for learners with special needs." },
        { id: "d3q4", text: "[Placeholder] Respects learners' cultural backgrounds." },
        { id: "d3q5", text: "[Placeholder] Uses differentiated instruction where appropriate." },
        { id: "d3q6", text: "[Placeholder] Encourages inclusivity in classroom activities." }
      ]
    },
    {
      partNumber: 4,
      title: "Domain 4: Curriculum and Planning",
      questions: [
        { id: "d4q1", text: "[Placeholder] Aligns lesson objectives with the curriculum." },
        { id: "d4q2", text: "[Placeholder] Plans lessons with clear learning outcomes." },
        { id: "d4q3", text: "[Placeholder] Sequences lesson content logically." },
        { id: "d4q4", text: "[Placeholder] Uses appropriate teaching resources per lesson plan." },
        { id: "d4q5", text: "[Placeholder] Adapts plans based on learner progress." },
        { id: "d4q6", text: "[Placeholder] Incorporates relevant, updated content." }
      ]
    },
    {
      partNumber: 5,
      title: "Domain 5: Assessment and Reporting",
      questions: [
        { id: "d5q1", text: "[Placeholder] Uses appropriate formative assessment strategies." },
        { id: "d5q2", text: "[Placeholder] Provides timely and constructive feedback." },
        { id: "d5q3", text: "[Placeholder] Aligns assessment with learning objectives." },
        { id: "d5q4", text: "[Placeholder] Uses assessment results to improve instruction." },
        { id: "d5q5", text: "[Placeholder] Communicates learner progress clearly." },
        { id: "d5q6", text: "[Placeholder] Maintains accurate records of learner performance." }
      ]
    }
  ],
  peerToPeer: [
    {
      partNumber: 1,
      title: "Contributions",
      questions: [
        { id: "pr1", text: "1. Rarely offers useful ideas. Is disruptive. Negative attitude. Task not performed. <br> 2. Sometimes offers useful ideas. Rarely displays positive attitude, Once in a while. <br> 3. Usually offers useful ideas. Generally, displays positive attitude, often performing the task. <br> 4. Routinely offers useful ideas. Always displays positive attitude. Regularly doing the task." }
      ]
    },
    {
      partNumber: 2,
      title: "Cooperation with Others",
      questions: [
        { id: "pr2", text: "1. Did not do any work. Does not contribute. Does not work well with others. <br> 2. Sometimes cooperative. Could have shared more workload. Requires structure, directions and leadership. <br> 3. Usually cooperative. Did own part of workload. Works well with others. <br> 4. Always cooperative. Did more than others. Highly productive. Works extremely well with others." }
      ]
    },
    {
      partNumber: 3,
      title: "Focus and Commitments",
      questions: [
        { id: "pr3", text: "1. Often is not a good team member. Does not focus on the task. Let others do the work. <br> 2. Sometimes focuses on the task. Not always a good team member. Must be prodded and reminded to keep on task. <br> 3. Does not cause problems in the group. Focuses on the task most of the time. Can count on this person. <br> 4. Tries to keep people working together. Almost always focused on the task. Is very self-directed." }
      ]
    },
    {
      partNumber: 4,
      title: "Team Role Fulfillment",
      questions: [
        { id: "pr4", text: "1. Participates in few or no group meetings. Provides no leadership. Does little or no work assign by the group. Not helping each other. <br> 2. Participates in some group meetings. Provides some leadership. Does some of the work assigned by the group. Seldom helping each other. <br> 3. Participates in most group meetings. Provides leadership when asked. Does most of the work assigned by the group. Frequently helping each other. <br> 4. Participates in all group meetings. Assumes the leadership role. Does all the work that is assigned by the group. Generally helping each other." }
      ]
    },
    {
      partNumber: 5,
      title: "Ability to Communicate",
      questions: [
        { id: "pr5", text: "1. Rarely listens to, shares with, or supports the efforts of others. Never initiate communication with group members or adviser for clarifications. Provides no feedback. Does not relay any information to teammates. <br> 2. Often listens to, shares with, and supports the efforts of others. Does not initiate communication with members or adviser for clarifications. Rarely listens to others. Provides little feedback. Relays very little information that relates to the topic. <br> 3. Usually listens to, shares with, and supports the efforts of others. Sometimes initiate communication with group members or adviser for clarifications. Provides some effective feedback. Relays some basic information that relates to the topic. <br> 4. Always listens to, shares with, and supports the efforts of others. Initiate communication with group members or adviser for clarifications and relays a lot of relevant information. Provides effective feedback."}
      ]
    },
    {
      partNumber: 6,
      title: "Completion of Assigned Tasks",
      questions: [
        { id: "pr6", text: "1. Work is generally sloppy and incomplete, contains excessive errors, and is mostly late. <br> 2. Work tends to be disorderly, incomplete, inaccurate and is usually late. <br> 3. Work is generally complete, meets the requirements of the task, and is mostly done on time. <br> 4. Work is complete, well-organized, error-free, and done on time or early."}
      ]
    },
    {
      partNumber: 7,
      title: "Attendance & Punctuality",
      questions: [
        { id: "pr7", text: "1. Incurred lates 10 times or more in a month, with rampant absences. No advance notice if need to absent. Received two Sanctions. <br> 2. Lates for 6-9 times in a month with 2-3 absences. No advance notice if need to absent/ Received one sanction. <br> 3. Lates for 1-5 times in a month with 1 absent. No advance notice if need to absent. No sanction. <br> 4. Reports for work on time, provides advance notice if need to absent."}
      ]
    }
  ],
  hrEvaluation: [
    {
      partNumber: 1,
      title: "Document Submission Completeness",
      questions: [
        { id: "p1", text: "[Placeholder] Submitted all required teaching documents on time." },
        { id: "p2", text: "[Placeholder] Lesson plans/instructional materials are complete and up to date." },
        { id: "p3", text: "[Placeholder] Grading records and reports submitted as required." }
      ]
    },
    {
      partNumber: 2,
      title: "Seminars and Trainings Attended",
      questions: [
        { id: "p4", text: "[Placeholder] Attended required school-organized seminars/trainings this semester." },
        { id: "p5", text: "[Placeholder] Applies learnings from trainings to teaching practice." },
        { id: "p6", text: "[Placeholder] Actively participates in professional development opportunities." }
      ]
    }
  ]
};

function getCriteria(type) {
  const storageKey = CRITERIA_TYPES[type];
  const stored = localStorage.getItem(storageKey);
  if (stored) {
      return JSON.parse(stored);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CRITERIA[type])
  );
}

function saveCriteria(type, parts) {
  const storageKey = CRITERIA_TYPES[type];
  localStorage.setItem(storageKey, JSON.stringify(parts));
}

// ============================================
// Rating Scale (per evaluation type, independently editable)
// ============================================
// Each type has its own 5-point scale labels (shown as "5 - Always
// Manifested", etc.) and equivalence bands (score range -> label like
// "Outstanding"). Defaults below match what was previously hardcoded
// identically across all 4 types.

const DEFAULT_SCALE = {
  scaleLabels: [
    { value: 5, label: "Always Manifested" },
    { value: 4, label: "Often Manifested" },
    { value: 3, label: "Sometimes Manifested" },
    { value: 2, label: "Rarely Manifested" },
    { value: 1, label: "Never Manifested" }
  ],

  equivalents: [
    { min: 4.20, max: 5.00, label: "Outstanding" },
    { min: 3.40, max: 4.19, label: "Very Satisfactory" },
    { min: 2.60, max: 3.39, label: "Satisfactory" },
    { min: 1.80, max: 2.59, label: "Needs Improvement" },
    { min: 1.00, max: 1.79, label: "Poor" }
  ]
};

const DEFAULT_SCALES = {
  student: DEFAULT_SCALE,

  classroomObservation: DEFAULT_SCALE,

  peerToPeer: {
    scaleLabels: [
      { value: 4, label: "4" },
      { value: 3, label: "3" },
      { value: 2, label: "2" },
      { value: 1, label: "1" }
    ],

    equivalents: [
      { min: 3.30, max: 4.00, label: "Excellent" },
      { min: 2.50, max: 3.29, label: "Very Satisfactory" },
      { min: 1.80, max: 2.49, label: "Satisfactory" },
      { min: 1.00, max: 1.79, label: "Needs Improvement" }
    ]
  },

  hrEvaluation: DEFAULT_SCALE
};

const SCALE_TYPES = {
  student: "scale_student",
  classroomObservation: "scale_classroomObservation",
  peerToPeer: "scale_peerToPeer",
  hrEvaluation: "scale_hrEvaluation"
};

function getScale(type) {
  const storageKey = SCALE_TYPES[type];
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    return JSON.parse(stored);
  }

  return JSON.parse(
    JSON.stringify(DEFAULT_SCALES[type] || DEFAULT_SCALE)
  );
}

// --- Load the authoritative rating scale from the backend ---
async function loadEvaluationScale(type) {
  if (!type) {
    throw new Error("Evaluation type is required.");
  }

  const scale = await apiGet(`/rating-scales/${type}`);

  if (
    !scale ||
    !Array.isArray(scale.scale_labels) ||
    !Array.isArray(scale.equivalents)
  ) {
    throw new Error(`Invalid rating scale returned for ${type}.`);
  }

  return {
    scaleLabels: scale.scale_labels,
    equivalents: scale.equivalents
  };
}

function saveScale(type, scale) {
  const storageKey = SCALE_TYPES[type];
  localStorage.setItem(storageKey, JSON.stringify(scale));
}

// --- Look up the equivalent label for a given score, using a specific type's scale ---
function getScaleEquivalent(type, score) {
  const scale = getScale(type);
  const match = scale.equivalents.find((band) => score >= band.min && score <= band.max);
  return match ? match.label : "N/A";
}

// --- Build the descriptive scale text shown above questions, e.g. "5 - Always Manifested, 4 - Often Manifested..." ---
function getScaleDescriptionText(type) {
  const scale = getScale(type);
  return scale.scaleLabels
    .map((s) => `${s.value} - ${s.label}`)
    .join(", ");
}