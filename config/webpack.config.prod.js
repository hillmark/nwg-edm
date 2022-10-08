const CopyPlugin = require("copy-webpack-plugin");
const config = require("./webpack.config");
const path = require("path");

module.exports = {
  ...config,
  mode: "production",
  plugins: [
    ...config.plugins,
    new CopyPlugin({
      patterns: [
        {
          from: "public",
          filter: async (filePath) => {
            return path.basename(filePath) !== "index.html";
          },
        },
      ],
    }),
  ],
};
