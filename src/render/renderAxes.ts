module powerbi.extensibility.visual {
    import svg = powerbi.extensibility.utils.svg;
    import CssConstants = svg.CssConstants;

    // powerbi.extensibility.utils.type
    import PixelConverter = powerbi.extensibility.utils.type.PixelConverter;
    import axis = powerbi.extensibility.utils.chart.axis;
    import createAxis = powerbi.extensibility.utils.chart.axis.createAxis;
    import valueFormatter = powerbi.extensibility.utils.formatting.valueFormatter;
    import valueType = powerbi.extensibility.utils.type.ValueType;
    import textMeasurementService = powerbi.extensibility.utils.formatting.textMeasurementService;
    import TextProperties = powerbi.extensibility.utils.formatting.TextProperties;

    module Selectors {
        export const AxisLabelSelector = CssConstants.createClassAndSelector("axisLabel");
    }

    export class RenderAxes {
        private static DefaultAxisXTickPadding: number = 10;
        private static DefaultAxisYTickPadding: number = 10;

        private static AxisLabelOffset: number = 2;
        private static YAxisLabelTransformRotate: string = "rotate(-90)";
        private static DefaultDY: string = "1em";

        public static createD3Axes(
            axesDomains: AxesDomains,
            size: ISize,
            metadata: VisualMeasureMetadata,
            settings: VisualSettings,
            host: IVisualHost,
            isSmallMultiple: boolean = false,
            barHeight: number,
            maxYLabelsWidth: number = null): IAxes {
            let xAxisProperties: axis.IAxisProperties = null;

            let valueAxisScale: string = settings.valueAxis.axisScale;

            let xAxisPrecision: any = settings.valueAxis && settings.valueAxis.precision != null && settings.valueAxis.precision >= 0
                ? settings.valueAxis.precision.toString()
                : undefined;

            if (xAxisPrecision === 0) {
                xAxisPrecision = xAxisPrecision.toString();
            }

            let xAxisFormatString: string = valueFormatter.getFormatStringByColumn(metadata.cols.value);

            const skipValueRange: boolean = isSmallMultiple && settings.valueAxis.rangeType !== AxisRangeType.Custom,
                startValue: number = skipValueRange ? null : settings.valueAxis.start,
                endValue: number = skipValueRange ? null : settings.valueAxis.end;

            xAxisProperties = createAxis({
                pixelSpan: size.width,
                dataDomain: axesDomains.xAxisDomain,
                metaDataColumn: metadata.cols.value,
                formatString: xAxisFormatString,
                outerPadding: 0,
                innerPadding: 0,
                isScalar: true,
                isVertical: false,
                isCategoryAxis: false,
                scaleType: valueAxisScale,
                useTickIntervalForDisplayUnits: true,
                axisDisplayUnits: settings.valueAxis.displayUnits,
                disableNice: startValue != null || endValue != null,
                axisPrecision: xAxisPrecision
            });

            xAxisProperties.axis
                .innerTickSize(-size.height)
                .tickPadding(RenderAxes.DefaultAxisXTickPadding)
                .outerTickSize(1);

            xAxisProperties.axisLabel = settings.valueAxis.showTitle ? metadata.labels.x : "";

            // create Y axis
            let yAxisProperties: axis.IAxisProperties = null;
            let yAxisFormatString: string = valueFormatter.getFormatStringByColumn(metadata.cols.category) || valueFormatter.getFormatStringByColumn(metadata.groupingColumn);

            const categoryType: valueType = axis.getCategoryValueType(metadata.cols.category);
            let isOrdinal: boolean = axis.isOrdinal(categoryType);

            let yIsScalar: boolean = !isOrdinal;
            let categoryAxisScale: string = settings.categoryAxis.axisType === "categorical" ? "linear" : settings.categoryAxis.axisScale;
            let axisType: string = !yIsScalar ? "categorical" : settings.categoryAxis.axisType;

            let dateColumnFormatter = null;

            if (metadata.cols.category) {
                dateColumnFormatter = valueFormatter.create({
                    format: valueFormatter.getFormatStringByColumn(metadata.cols.category, true) || metadata.cols.category.format,
                    cultureSelector: host.locale
                });
            } else if (metadata.groupingColumn) {
                dateColumnFormatter = valueFormatter.create({
                    format: valueFormatter.getFormatStringByColumn(metadata.groupingColumn, true) || metadata.groupingColumn.format,
                    cultureSelector: host.locale
                });
            }

            let innerPadding: number = settings.categoryAxis.innerPadding / 100;
            const outerPadding: number = yIsScalar && axisType === "continuous" ? barHeight / 2 : 0;

            let fontSize: string = PixelConverter.toString(settings.categoryAxis.fontSize);
            let fontFamily: string = settings.categoryAxis.fontFamily;

            const skipCategoryRange: boolean = isSmallMultiple && settings.categoryAxis.rangeType !== AxisRangeType.Custom,
                startCategory: number = skipCategoryRange ? null : settings.categoryAxis.start,
                endCategory: number = skipCategoryRange ? null : settings.categoryAxis.end;

            yAxisProperties = createAxis({
                pixelSpan: size.height,
                dataDomain: axesDomains.yAxisDomain,
                metaDataColumn: metadata.cols.category || metadata.groupingColumn,
                formatString: yAxisFormatString,
                outerPadding: outerPadding,
                innerPadding: innerPadding,
                scaleType: yIsScalar ? categoryAxisScale : undefined,
                isScalar: yIsScalar && axisType === "continuous",
                isVertical: true,
                isCategoryAxis: true,
                useTickIntervalForDisplayUnits: true,
                disableNice: axisType === "continuous" && (startCategory != null || endCategory != null),
                getValueFn: (index: number, dataType: valueType): any => {
                    if (dataType.dateTime && dateColumnFormatter) {
                        let options = {};
                        
                        if (yIsScalar && axisType === "continuous") {
                            options = {
                                month: "short",
                                year: "numeric"
                            };
                        } else {
                            options = {
                                day: "numeric",
                                month: "numeric",
                                year: "numeric"
                            };
                        }

                        let formattedString: string = dateColumnFormatter.format(new Date(index).toLocaleString("en-US", options));

                        if (maxYLabelsWidth && axisType !== "continuous") {                            

                            let textProperties: TextProperties = {
                                text: formattedString,
                                fontFamily: fontFamily,
                                fontSize: fontSize
                            };

                            return  textMeasurementService.getTailoredTextOrDefault(textProperties, maxYLabelsWidth);
                        }

                        return formattedString;
                    }
                    
                    if (maxYLabelsWidth && axisType !== "continuous") {                            

                        let textProperties: TextProperties = {
                            text: index.toString(),
                            fontFamily: fontFamily,
                            fontSize: fontSize
                        };

                        return  textMeasurementService.getTailoredTextOrDefault(textProperties, maxYLabelsWidth);
                    }
                    return index;
                }
            });

            // For Y axis, make ticks appear full-width.
            yAxisProperties.axis
                .tickPadding(RenderAxes.DefaultAxisYTickPadding)
                .orient(settings.categoryAxis.position)
                .innerTickSize(0)
                .outerTickSize(0);

            yAxisProperties.axisLabel = settings.categoryAxis.showTitle ? metadata.labels.y : "";

            return {
                x: xAxisProperties,
                y: yAxisProperties,
                yIsScalar
            };
        }

        public static render(settings: VisualSettings, xAxisSvgGroup: d3.Selection<SVGElement>, yAxisSvgGroup: d3.Selection<SVGElement>, axes: IAxes, maxYLabelsWidth = null) {
            // Before rendering an axis, we need to remove an old one.
            // Otherwise, our visual will be cluttered by multiple axis objects, which can
            // // affect performance of our visual.
            // this.xAxisSvgGroup.selectAll("*").remove();
            // this.yAxisSvgGroup.selectAll("*").remove();

            // Now we call the axis funciton, that will render an axis on our visual.
            if (settings.valueAxis.show) {
                xAxisSvgGroup.call(axes.x.axis);
                let axisText = xAxisSvgGroup.selectAll("g").selectAll("text");
                let axisLines = xAxisSvgGroup.selectAll("g").selectAll("line");

                let color: string = settings.valueAxis.axisColor.toString();
                let fontSize: string = PixelConverter.toString(settings.valueAxis.fontSize);
                let fontFamily: string = settings.valueAxis.fontFamily;
                let gridlinesColor: string = settings.valueAxis.gridlinesColor.toString();
                let strokeWidth: string = PixelConverter.toString(settings.valueAxis.strokeWidth);
                let showGridlines: DataViewPropertyValue = settings.valueAxis.showGridlines;
                let lineStyle: DataViewPropertyValue = settings.valueAxis.lineStyle;

                let strokeDasharray = visualUtils.getLineStyleParam(lineStyle);

                axisText.style({
                    "fill": color,
                    "font-size": fontSize,
                    "font-family": fontFamily
                });

                axisLines.style({
                    "stroke": gridlinesColor,
                    "stroke-width": strokeWidth,
                    "stroke-dasharray": strokeDasharray
                });

                if (showGridlines) {
                    axisLines.style("opacity", "1");
                } else {
                    axisLines.style("opacity", "0");
                }

            } else {
                xAxisSvgGroup.selectAll("*").remove();
            }

            if (settings.categoryAxis.show) {
                yAxisSvgGroup.call(axes.y.axis);
                let axisText = yAxisSvgGroup.selectAll("g").selectAll("text");

                let color: string = settings.categoryAxis.axisColor.toString();
                let fontSize: string = PixelConverter.toString(settings.categoryAxis.fontSize);
                let fontFamily: string = settings.categoryAxis.fontFamily;

                axisText.style({
                    "fill": color,
                    "stroke": "none",
                    "font-size": fontSize,
                    "font-family": fontFamily
                });

            } else {
                yAxisSvgGroup.selectAll("*").remove();
            }

        }

        public static renderLabels(
            viewport: IViewport,
            visualMargin: IMargin,
            visualSize: ISize,
            axisLabelsData: Array<string>,
            settings: VisualSettings,
            axes: IAxes,
            axisLabelsGroup: d3.selection.Update<string>,
            axisGraphicsContext: d3.Selection<SVGElement>) {

            const margin: IMargin = visualMargin,
                width: number = viewport.width,
                height: number = viewport.height,
                yAxisOrientation: string = "right",
                showY1OnRight: boolean = yAxisOrientation === settings.categoryAxis.position;

            let showYAxisTitle: boolean = settings.categoryAxis.show && settings.categoryAxis.showTitle;
            let showXAxisTitle: boolean = settings.valueAxis.show && settings.valueAxis.showTitle;

            if (!showXAxisTitle) {
                axisLabelsData[0] = null;
            }

            if (!showYAxisTitle) {
                axisLabelsData[1] = null;
            }

            axisLabelsGroup = axisGraphicsContext.selectAll("*")
                .data(axisLabelsData);

            // When a new category added, create a new SVG group for it.
            axisLabelsGroup.enter()
                .append("text")
                .attr("class", Selectors.AxisLabelSelector.className);

            // For removed categories, remove the SVG group.
            axisLabelsGroup.exit()
                .remove();

            let xColor: string = settings.valueAxis.axisTitleColor;
            let xFontSize: number = parseInt(settings.valueAxis.titleFontSize.toString());
            let xFontSizeString: string = PixelConverter.toString(xFontSize);
            let xTitle: DataViewPropertyValue = settings.valueAxis.axisTitle;
            let xAxisStyle: DataViewPropertyValue = settings.valueAxis.titleStyle;
            let xAxisFontFamily: string = settings.valueAxis.titleFontFamily;

            let yColor: string = settings.categoryAxis.axisTitleColor;
            let yFontSize: number = parseInt(settings.categoryAxis.titleFontSize.toString());
            let yFontSizeString: string = PixelConverter.toString(yFontSize);
            let yTitle: DataViewPropertyValue = settings.categoryAxis.axisTitle;
            let yAxisStyle: DataViewPropertyValue = settings.categoryAxis.titleStyle;
            let yAxisFontFamily: string = settings.categoryAxis.titleFontFamily;

            axisLabelsGroup
                .style({ "text-anchor": "middle" })
                .text(d => d)
                .call((text: d3.Selection<any>) => {
                    const textSelectionX: d3.Selection<any> = d3.select(text[0][0]);

                    textSelectionX.attr({
                        "transform": svg.translate(
                            (width) / RenderAxes.AxisLabelOffset,
                            (height + visualSize.height + xFontSize + margin.top) / 2),
                        "dy": '.8em'
                    });

                    if (showXAxisTitle && xTitle && xTitle.toString().length > 0) {
                        textSelectionX.text(xTitle as string);
                    }

                    if (showXAxisTitle && xAxisStyle) {
                        let newTitle: string = visualUtils.getTitleWithUnitType(textSelectionX.text(), xAxisStyle, axes.x);

                        textSelectionX.text(newTitle);
                    }

                    textSelectionX.style({
                        "fill": xColor,
                        "font-size": xFontSizeString,
                        "font-family": xAxisFontFamily
                    });

                    const textSelectionY: d3.Selection<any> = d3.select(text[0][1]);

                    textSelectionY.attr({
                        "transform": showY1OnRight ? RenderAxes.YAxisLabelTransformRotate : RenderAxes.YAxisLabelTransformRotate,
                        "y": showY1OnRight
                            ? width - margin.right - yFontSize
                            : 0,
                        "x": -((visualSize.height + margin.top + margin.bottom) / RenderAxes.AxisLabelOffset),
                        "dy": (showY1OnRight ? '-' : '') + RenderAxes.DefaultDY
                    });

                    if (showYAxisTitle && yTitle && yTitle.toString().length > 0) {
                        textSelectionY.text(yTitle as string);
                    }

                    if (showYAxisTitle) {
                        let newTitle: string = visualUtils.getTitleWithUnitType(textSelectionY.text(), yAxisStyle, axes.y);

                        textSelectionY.text(newTitle);
                    }

                    textSelectionY.style({
                        "fill": yColor,
                        "font-size": yFontSizeString,
                        "font-family": yAxisFontFamily
                    });
                });
        }

        public static calculateAxesDomains(allDatapoint: VisualDataPoint[], 
            visibleDatapoints: VisualDataPoint[], 
            settings: VisualSettings, 
            metadata: VisualMeasureMetadata, 
            isSmallMultiple: boolean = false): AxesDomains {

            return {
                yAxisDomain: this.calculateCategoryDomain(visibleDatapoints, settings, metadata, isSmallMultiple),
                xAxisDomain: this.calculateValueDomain(allDatapoint, settings, isSmallMultiple) 
            };
        }

        public static calculateValueDomain(allDatapoint: VisualDataPoint[], 
            settings: VisualSettings, 
            isSmallMultiple: boolean = false): any[] { 

            let minValue: number = d3.min(allDatapoint, d => <number>d.value);
            let maxValue: number = d3.max(allDatapoint, d => <number>d.value);

            minValue = minValue < 0 ? minValue : 0;
            maxValue = maxValue > 0 ? maxValue : 0;

            let dataDomainMinX: number = minValue;
            let dataDomainMaxX: number = maxValue;

            let constantLineValue: number = settings.constantLine.value;

            if (constantLineValue || constantLineValue === 0) {
                dataDomainMinX = dataDomainMinX > constantLineValue ? constantLineValue : dataDomainMinX;
                dataDomainMaxX = dataDomainMaxX < constantLineValue ? constantLineValue : dataDomainMaxX;
            }

            const skipStartEnd: boolean = isSmallMultiple && settings.valueAxis.rangeType !== AxisRangeType.Custom;

            let start = skipStartEnd ? null : settings.valueAxis.start;
            let end = skipStartEnd ? null : settings.valueAxis.end;

            if (start != null){
                dataDomainMinX = start;
            }

            if ( settings.valueAxis.axisScale === 'log' && dataDomainMinX === 0 ){
                dataDomainMinX = 1;
            }

            return [dataDomainMinX, end != null ? end : dataDomainMaxX]
        }

        public static calculateCategoryDomain(visibleDatapoints: VisualDataPoint[], 
            settings: VisualSettings, 
            metadata: VisualMeasureMetadata, 
            isSmallMultiple: boolean = false): any[] { 
            
            const categoryType: valueType = axis.getCategoryValueType(metadata.cols.category);
            let isOrdinal: boolean = axis.isOrdinal(categoryType);

            let dataDomainY = visibleDatapoints.map(d => <any>d.category).filter(d => !!d);

            let yIsScalar: boolean = !isOrdinal;
            let axisType: string = !yIsScalar ? "categorical" : settings.categoryAxis.axisType;

            if (yIsScalar && axisType === "continuous") {
                let dataDomainMinY: number = d3.min(visibleDatapoints, d => <number>d.category);
                let dataDomainMaxY: number = d3.max(visibleDatapoints, d => <number>d.category);

                const skipStartEnd: boolean = isSmallMultiple && settings.categoryAxis.rangeType !== AxisRangeType.Custom;

                let start = skipStartEnd ? null : settings.categoryAxis.start;
                let end = skipStartEnd ? null : settings.categoryAxis.end;

                dataDomainY = [start != null ? settings.categoryAxis.start : dataDomainMinY, end != null ? end : dataDomainMaxY];
            }

            return dataDomainY;
        }
    }

}