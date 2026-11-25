const fs = require('fs');
const path = require('path');

let cachedPythonPath = null;

function getPythonExecutable() {
  if (cachedPythonPath) return cachedPythonPath;

  const candidates = [
    process.env.PYTHON,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python314', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Python314', 'python.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Python313', 'python.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Python312', 'python.exe'),
    'C:\\Python314\\python.exe',
    'C:\\Python313\\python.exe',
    'C:\\Python312\\python.exe'
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      cachedPythonPath = c;
      return c;
    }
  }

  cachedPythonPath = 'python';
  return cachedPythonPath;
}

module.exports = { getPythonExecutable };
