const isValidHex = (color) => /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color);

const isValidRgba = (color) => /^rgba\((\d{1,3}), (\d{1,3}), (\d{1,3}), (0(\.\d+)?|1(\.0)?)\)$/.test(color);

const isValidGradient = (value) => /^linear-gradient\([^)]+\)$/i.test(value) || /^radial-gradient\([^)]+\)$/i.test(value);

const validateBgColorMsg = (color) => {
  const validBgColorMsg = [
    '#444',
    'rgba(5, 18, 36,0.5)',
    'linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(231,173,82,0.5) 100%)',
    'linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(187,74,148,0.5) 100%)',
    'linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(82,230,231,0.5) 100%)',
    'linear-gradient(180deg, rgba(84,57,113,0.5) 0%, rgba(28,69,246,0.5) 100%)'
  ];
  if (validBgColorMsg.includes(color)) return true; 
  if (isValidGradient(color)) return true; 
  return false;
};

const validateNameColor = (color) => {
  const validNameColor = [
    '#5F9EA0',  
    '#ff6700',  
    '#f54984', 
    '#ccff00', 
    '#00FF9C'
  ];
  return validNameColor.includes(color);
};

const validateProfileBg = (color) => {
  const validProfileBg = [
    'transparent',
    '#493b73',
    '#517d72',
    'radial-gradient(circle, rgba(26,113,157,1) 13%, rgba(47,186,207,1) 100%)',
    'radial-gradient(circle, rgba(26,113,157,1) 13%, rgba(129,47,207,1) 100%)'
  ];
  if (validProfileBg.includes(color)) return true; 
  if (isValidGradient(color)) return true; 
  return false;
};

module.exports = { validateBgColorMsg, validateNameColor, validateProfileBg };