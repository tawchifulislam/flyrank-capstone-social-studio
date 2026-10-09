export const profiles = {
  telegram: {
    maxLength: 1000,
    maxHashtags: 3,
    tone: "friendly, conversational",
  },
  x: {
    maxLength: 280,
    maxHashtags: 2,
    tone: "short, punchy",
  },
  linkedin: {
    maxLength: 3000,
    maxHashtags: 5,
    tone: "professional, insight-led",
  },
};

export const platformNames = Object.keys(profiles);
