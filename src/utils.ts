module powerbi.extensibility.visual.visualUtils {
    import IAxisProperties = powerbi.extensibility.utils.chart.axis.IAxisProperties;
    import TextMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;
    import IValueFormatter = powerbi.extensibility.utils.formatting.IValueFormatter;
    import axis = powerbi.extensibility.utils.chart.axis;
    import valueType = powerbi.extensibility.utils.type.ValueType;

    const DisplayUnitValue: number = 1;

    export function calculateBarCoordianatesByData(data: VisualData, settings: VisualSettings, dataPointThickness: number, isSmallMultiple: boolean = false): void {
        let dataPoints: VisualDataPoint[] = data.dataPoints;
        let axes: IAxes = data.axes;

        let legendDataPointsCount: number = data.legendData
                                                    && data.legendData.dataPoints ? data.legendData.dataPoints.length : 1;

        this.calculateBarCoordianates(dataPoints, legendDataPointsCount, axes, settings, dataPointThickness, isSmallMultiple);
    }

    export function calculateBarCoordianates(dataPoints: VisualDataPoint[], 
                                            clustersCount: number, 
                                            axes: IAxes, 
                                            settings: VisualSettings, 
                                            dataPointThickness: number, 
                                            isSmallMultiple: boolean = false): void {

        const skipCategoryStartEnd: boolean = isSmallMultiple && settings.categoryAxis.rangeType !== AxisRangeType.Custom,
            skipValueStartEnd: boolean = isSmallMultiple && settings.valueAxis.rangeType !== AxisRangeType.Custom;

        const categoryAxisIsContinuous: boolean = axes.yIsScalar && settings.categoryAxis.axisType !== "categorical";

        const categoryAxisStartValue: number = categoryAxisIsContinuous && settings.categoryAxis.start ? settings.categoryAxis.start : 0;
        const categoryAxisEndValue: number = categoryAxisIsContinuous && settings.categoryAxis.end ? settings.categoryAxis.end : Number.MAX_VALUE;

        const thickness: number = dataPointThickness / clustersCount;

        // Implement correct continuous logic instead of this!!!
        dataPointThickness = dataPoints.length > 2 ? dataPointThickness : dataPointThickness / 2;

        dataPoints.forEach(point => {
            let height = 0;
            if (axes.yIsScalar && categoryAxisIsContinuous) {
                let start = skipCategoryStartEnd ? null : settings.categoryAxis.start,
                    end = skipCategoryStartEnd ? null : settings.categoryAxis.end;

                height = start != null && start > point.category || dataPointThickness < 0 ? 0 : dataPointThickness / clustersCount;
                height = end != null && end <= point.category ? 0 : height;
            } else {
                height = axes.y.scale.rangeBand() / clustersCount;
            }

            if (categoryAxisIsContinuous){
                const categoryvalueIsInRange: boolean = point.category >= categoryAxisStartValue && point.category <= categoryAxisEndValue;
                if (!categoryvalueIsInRange){
                    setZeroCoordinatesForPoint(point);
                    return;
                }
            }

            let y: number = axes.y.scale(point.category);

            if (categoryAxisIsContinuous) {
                y -= height * clustersCount / 2;
            }
            if ( clustersCount > 1 ){
                y += height * point.shiftValue;
            }

            const minValue: number = axes.x.dataDomain[0],
                maxValue: number = axes.x.dataDomain[1];

            let fromValue: number = point.value >= 0 ? 0 : point.value;

            if (fromValue < minValue) {
                fromValue = minValue;
            } else if (fromValue > maxValue) {
                setZeroCoordinatesForPoint(point);
                return;
            }

            let fromCoordinate: number = axes.x.scale(fromValue);

            let toValue = point.value >= 0 ? point.value : 0;

            if (toValue < minValue) {
                setZeroCoordinatesForPoint(point);
                return;                
            } else if (toValue > maxValue) {
                toValue = maxValue;
            }

            let toCoordinate: number = axes.x.scale(toValue);

            if ( toCoordinate <= fromCoordinate ){
                setZeroCoordinatesForPoint(point);
                return;
            }

            let volume: number = toCoordinate - fromCoordinate;
            if (volume < 1 && volume !== 0){
                volume = 1;
            }

            point.barCoordinates = {
                height: height,
                width: volume, //volume,
                y,
                x: fromCoordinate
            };
        });

      //  if (categoryAxisIsContinuous) {
      //      recalculateThicknessForContinuous(dataPoints, thickness, clustersCount);
      //  }
    }

    function setZeroCoordinatesForPoint(point: VisualDataPoint): void {
        point.barCoordinates = {height: 0, width: 0, x: 0, y: 0};
    }

    export function recalculateThicknessForContinuous(dataPoints: VisualDataPoint[], dataPointThickness: number, clustersCount: number) {
        let minHeight: number = 1.5,
            minDistance: number = Number.MAX_VALUE;

        let dataPointsSorted: VisualDataPoint[] = dataPoints.sort((a, b) => {
            return a.barCoordinates.y - b.barCoordinates.y;
        });

        let firstDataPoint: VisualDataPoint = dataPointsSorted[0];

        for (let i = 1; i < dataPointsSorted.length; ++i) { 
            let distance: number = dataPointsSorted[i].barCoordinates.y - firstDataPoint.barCoordinates.y;

            minDistance = distance < minDistance ? distance : minDistance;
            firstDataPoint = dataPointsSorted[i];
        }

        if (minDistance < minHeight) {
            
        } else if (minHeight < minDistance && minDistance < dataPointThickness) {
            minHeight = minDistance;
        } else {
            minHeight = dataPointThickness;
        }

        if (dataPointThickness && dataPointThickness !== minHeight) {
            dataPointsSorted.forEach(d => {
                const oldHeight: number = d.barCoordinates.height;
                d.barCoordinates.height = oldHeight ? minHeight : 0;                
                d.barCoordinates.y = d.barCoordinates.y + dataPointThickness / 2 - oldHeight * d.shiftValue;

                d.barCoordinates.y -= minHeight / 2;
                
                if ( clustersCount > 1 ){
                    d.barCoordinates.y += minHeight * d.shiftValue;
                }
            });
        }
    }

    export function calculateLabelCoordinates(data: VisualData,
                                            settings: categoryLabelsSettings,
                                            metadata: VisualMeasureMetadata,
                                            chartWidth: number,
                                            isLegendRendered: boolean,
                                            dataPoints: VisualDataPoint[] = null) {
        if (!settings.show) {
            return;
        }

        let dataPointsArray: VisualDataPoint[] = dataPoints || data.dataPoints;

        let dataLabelFormatter: IValueFormatter = formattingUtils.createFormatter(settings.displayUnits,
                                                                        settings.precision,
                                                                        metadata.cols.value,
                                                                        formattingUtils.getValueForFormatter(data));

        let textPropertiesForWidth: TextProperties = formattingUtils.getTextProperties(settings);
        let textPropertiesForHeight: TextProperties = formattingUtils.getTextPropertiesForHeightCalculation(settings);

        dataPointsArray.forEach(dataPoint => {
            let formattedText: string = dataLabelFormatter.format(dataPoint.value);
            textPropertiesForHeight.text = formattedText;

            let textWidth: number = TextMeasurementService.measureSvgTextWidth(textPropertiesForWidth, formattedText);
            let textHeight: number = TextMeasurementService.estimateSvgTextHeight(textPropertiesForHeight);

            let barHeight: number = dataPoint.barCoordinates.height;

            if (settings.overflowText || textHeight +
                (settings.showBackground ? DataLabelHelper.labelBackgroundHeightPadding : 0) < barHeight) {
                let dy: number = dataPoint.barCoordinates.y + dataPoint.barCoordinates.height / 2 + (textHeight - 3) / 2,
                    dx: number = DataLabelHelper.calculatePositionShift(settings, textWidth, dataPoint, chartWidth, isLegendRendered);

                if (dx !== null) {
                    dataPoint.labelCoordinates = {
                        x: dx,
                        y: dy,
                        width: textWidth,
                        height: textHeight
                    };
                } else {
                    dataPoint.labelCoordinates = null;
                }
            } else {
                dataPoint.labelCoordinates = null;
            }
        });
    }

    export function getNumberOfValues(dataView: DataView): number {
        const columns: DataViewMetadataColumn[] = dataView.metadata.columns;
        let valueFieldsCount: number = 0;

        for (let columnName in columns) {
            const column: DataViewMetadataColumn = columns[columnName];

            if (column.roles && column.roles[Field.Value]) {
                ++valueFieldsCount;
            }
        }

        return valueFieldsCount;
    }

    export function getLineStyleParam(lineStyle) {
        let strokeDasharray;

        switch (lineStyle) {
            case "solid":
                strokeDasharray = "none";
                break;
            case "dashed":
                strokeDasharray = "7, 5";
                break;
            case "dotted":
                strokeDasharray = "2, 2";
                break;
        }

        return strokeDasharray;
    }

    export function getUnitType(xAxis: IAxisProperties): string {
        if (xAxis.formatter
            && xAxis.formatter.displayUnit
            && xAxis.formatter.displayUnit.value > DisplayUnitValue) {

            return xAxis.formatter.displayUnit.title;
        }

        return null;
    }

    export function getTitleWithUnitType(title, axisStyle, axis: IAxisProperties): string {
        let unitTitle = visualUtils.getUnitType(axis) || "No unit";
        switch (axisStyle) {
            case "showUnitOnly": {
                return unitTitle;
            }
            case "showTitleOnly": {
                return title;
            }
            case "showBoth": {
                return `${title} (${unitTitle})`;
            }
        }
    }

    export const DimmedOpacity: number = 0.4;
    export const DefaultOpacity: number = 1.0;

    export function getFillOpacity(selected: boolean, highlight: boolean, hasSelection: boolean, hasPartialHighlights: boolean): number {
        if ((hasPartialHighlights && !highlight) || (hasSelection && !selected)) {
            return DimmedOpacity;
        }

        return DefaultOpacity;
    }

    const CategoryMinHeight: number = 16;
    const CategoryMaxHeight: number = 130;

    export function calculateBarHeight(
        visualDataPoints: VisualDataPoint[],
        visualSize: ISize, 
        categoriesCount: number,
        categoryInnerPadding: number,
        settings: VisualSettings,
        isSmallMultiple: boolean = false): number {

        let currentBarHeight = visualSize.height / categoriesCount;
        let barHeight: number = 0;

        if (settings.categoryAxis.axisType === "categorical") {
            let innerPadding: number = categoryInnerPadding / 100;
            barHeight = d3.min([CategoryMaxHeight, d3.max([CategoryMinHeight, currentBarHeight])]) * (1 - innerPadding);
        } else {
            let dataPoints = [...visualDataPoints];

            const skipStartEnd: boolean = isSmallMultiple && settings.categoryAxis.rangeType !== AxisRangeType.Custom;

            let start = skipStartEnd ? null : settings.categoryAxis.start,
                end = skipStartEnd ? null : settings.categoryAxis.end;

            if (start != null || end != null) {
                dataPoints = dataPoints.filter(x => start != null ? x.value >= start : true 
                                                &&  end != null ? x.value <= end : true)
            }

            let dataPointsCount: number = dataPoints.map(x => x.category).filter((v, i, a) => a.indexOf(v) === i).length;

            if (dataPointsCount < 3) {
                let devider: number = 8;
                barHeight = visualSize.height / devider;
            } else if (dataPointsCount < 4) {
                let devider: number = 3.75;
                barHeight = visualSize.height / devider;
            } else {
                let devider: number = 3.75 + 1.25 * (dataPointsCount - 3); 
                barHeight = visualSize.height / devider;
            }
        }

        return barHeight;
    }

    export function getLabelsMaxWidth(group: d3.selection.Group): number {
        const widths: Array<number> = [];

        group.forEach((item: any) => {
            let dimension: ClientRect = item.getBoundingClientRect();
            widths.push(d3.max([dimension.width, dimension.height]));
        });

        if (group.length === 0) {
            widths.push(0);
        }

        return d3.max(widths);
    }

    export function getLabelsMaxHeight(group: d3.selection.Group): number {
        const heights: Array<number> = [];

        group.forEach((item: any) => {
            let dimension: ClientRect = item.getBoundingClientRect();
            heights.push(dimension.height);
        });

        if (group.length === 0) {
            heights.push(0);
        }

        return d3.max(heights);
    }
 
    export function GetYAxisTitleThickness(valueSettings: valueAxisSettings): number {

        let textPropertiesForHeight: TextProperties = {
            fontFamily: valueSettings.titleFontFamily,
            fontSize: valueSettings.titleFontSize.toString()
        };

        return TextMeasurementService.estimateSvgTextHeight(textPropertiesForHeight);
    }
 
    export function GetXAxisTitleThickness(categorySettings: categoryAxisSettings): number {

        let textPropertiesForHeight: TextProperties = {
            fontFamily: categorySettings.titleFontFamily,
            fontSize: categorySettings.titleFontSize.toString()
        };

        return TextMeasurementService.estimateSvgTextHeight(textPropertiesForHeight);
    }

    export function isSelected(selected: boolean, highlight: boolean, hasSelection: boolean, hasPartialHighlights: boolean): boolean {
        return !(hasPartialHighlights && !highlight || hasSelection && !selected);
    }

    export function compareObjects(obj1: any[], obj2: any[], property: string): boolean {
        let isEqual: boolean = false;

        if (obj1.length > 0 && obj2.length > 0 && obj1.length === obj2.length) {
            isEqual = true;
            obj1.forEach((o1, i) => {
                obj2.forEach((o2, j) => {
                    if (i === j) {
                        isEqual = isEqual && o1[property] === o2[property];
                    }
                });
            });
        } else if (obj1.length === 0 && obj2.length === 0) {
            isEqual = true;
        }

        return isEqual;
    }

    export function categoryIsScalar(metadata: VisualMeasureMetadata): boolean {
        const categoryType: valueType = axis.getCategoryValueType(metadata.cols.category);
        let isOrdinal: boolean = axis.isOrdinal(categoryType);

        return !isOrdinal;
    }
}