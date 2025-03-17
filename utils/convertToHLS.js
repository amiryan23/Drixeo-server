// const ffmpeg = require("fluent-ffmpeg");
// const ffmpegPath = require('ffmpeg-static')
// 
// const path = require("path");
// 
// ffmpeg.setFfmpegPath(ffmpegPath)
// 
// const convertToHLS = (inputPath, outputPath) => {
//   return new Promise((resolve, reject) => {
//     ffmpeg(inputPath)
//       .outputOptions([
//         "-preset ultrafast",
//         "-g 48",
//         "-sc_threshold 0",
//         "-map 0:v:0",
//         "-map 0:a:0",
//         "-c:v libx264",
//         "-c:a aac",
//         "-b:v 2000k",
//         "-b:a 128k",
//         "-f hls",
//         "-hls_time 4",
//         "-hls_list_size 0",
//         "-hls_segment_filename",
//         `${path.dirname(outputPath)}/segment_%03d.ts`,
//       ])
//       .output(outputPath)
//       .on("end", () => resolve(outputPath))
//       .on("error", reject)
//       .run();
//   });
// };
// 
// module.exports = {convertToHLS}