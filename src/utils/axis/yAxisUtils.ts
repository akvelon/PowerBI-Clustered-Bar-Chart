module powerbi.extensibility.visual.yAxisUtils {
    export const getYAxisMaxWidth = (visualWidth, settings) => ((visualWidth) / 100) * settings.categoryAxis.maximumSize;
}

