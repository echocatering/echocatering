module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      // Disable CSS minification to avoid CSS minimizer errors
      if (env === 'production') {
        // Find and remove CSS minimizer
        if (webpackConfig.optimization && webpackConfig.optimization.minimizer) {
          webpackConfig.optimization.minimizer = webpackConfig.optimization.minimizer.filter(
            (plugin) => {
              // Remove CssMinimizerPlugin
              const pluginName = plugin.constructor.name;
              if (pluginName === 'CssMinimizerPlugin' || pluginName.includes('CssMinimizer')) {
                console.log('⚠️  CSS minification disabled via CRACO');
                return false;
              }
              return true;
            }
          );
        }
      }
      
      return webpackConfig;
    },
  },
};

