const fs = require('fs');
const path = require('path');

const catsDir = path.join(__dirname, 'frontend', 'public', 'images', 'cats');
const outputFilePath = path.join(__dirname, 'frontend', 'public', 'cat-colors.json');

fs.readdir(catsDir, { withFileTypes: true }, (err, files) => {
  if (err) {
    console.error('Error reading cat image folders:', err);
    return;
  }

  const colors = files
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  fs.writeFile(outputFilePath, JSON.stringify({ colors }, null, 2), (err) => {
    if (err) {
      console.error('Error writing cat colors file:', err);
    } else {
      console.log(`Cat colors successfully written to ${outputFilePath}`);
    }
  });
});
