"use strict";

import { pixelConverter as PixelConverter} from "powerbi-visuals-utils-typeutils";

import { CssConstants, manipulation as svg } from "powerbi-visuals-utils-svgutils";

import powerbiApi from "powerbi-visuals-api";
import IVisualHost = powerbiApi.extensibility.visual.IVisualHost;
import DataViewPropertyValue = powerbiApi.DataViewPropertyValue;
import IViewport = powerbiApi.IViewport;

import { AxesDomains, IAxes, ISize, VisualDataPoint, VisualMeasureMetadata } from "../visualInterfaces";
import { AxisRangeType, VisualSettings } from "../settings";
import { d3Selection, getLineStyleParam, getTitleWithUnitType } from "../utils";

import {  } from "../utils";
import IMargin = axisInterfaces.IMargin;

import { select } from "d3-selection";
import { max, min } from "d3-array";
import { axis, axisInterfaces } from "powerbi-visuals-utils-chartutils";

import AxisOrientation = axisInterfaces.AxisOrientation;
import { textMeasurementService, valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { TextProperties } from "powerbi-visuals-utils-formattingutils/lib/src/interfaces";

import { valueType } from "powerbi-visuals-utils-typeutils";

import { convertPositionToAxisOrientation, createAxis } from "../utils/axis/yAxisUtils";

class Selectors {
    public static AxisLabelSelector = CssConstants.createClassAndSelector("axisLabel");
}

export class RenderAxes {
    private static DefaultAxisXTickPadding: number = 10;
    private static DefaultAxisYTickPadding: number = 10;

    private static AxisLabelOffset: number = 2;
    private static YAxisLabelTransformRotate: string = "rotate(-90)";
    private static DefaultDY: string = "1em";

    // eslint-disable-next-line max-lines-per-function
    public static createD3Axes(
        axesDomains: AxesDomains,
        size: ISize,
        metadata: VisualMeasureMetadata,
        settings: VisualSettings,
        host: IVisualHost,
        isSmallMultiple: boolean = false,
        barHeight: number,
        maxYLabelsWidth?: number): IAxes {

        const valueAxisScale: string = settings.valueAxis.axisScale;

        let xAxisPrecision: any = settings.valueAxis && settings.valueAxis.precision != null && settings.valueAxis.precision >= 0
            ? settings.valueAxis.precision.toString()
            : undefined;

        if (xAxisPrecision === 0) {
            xAxisPrecision = xAxisPrecision.toString();
        }

        const xAxisFormatString: string = valueFormatter.getFormatStringByColumn(<any>metadata.cols.value);

        const skipValueRange: boolean = isSmallMultiple && settings.valueAxis.rangeType !== AxisRangeType.Custom,
            startValue: number = skipValueRange ? null : settings.valueAxis.start,
            endValue: number = skipValueRange ? null : settings.valueAxis.end;

        const xAxisProperties = createAxis({
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
            axisPrecision: xAxisPrecision,
            orientation: AxisOrientation.bottom
        });

        xAxisProperties.axis
            .tickSizeInner(-size.height)
            .tickPadding(RenderAxes.DefaultAxisXTickPadding)
            .tickSizeOuter(1);

        xAxisProperties.axisLabel = settings.valueAxis.showTitle ? metadata.labels.x : "";

        // create Y axis
        const yAxisFormatString: string = valueFormatter.getFormatStringByColumn(<any>metadata.cols.category) || valueFormatter.getFormatStringByColumn(<any>metadata.groupingColumn);

        const categoryType: valueType.ValueType = axis.getCategoryValueType(metadata.cols.category);
        const isOrdinal: boolean = axis.isOrdinal(categoryType);

        const yIsScalar: boolean = !isOrdinal;
        const categoryAxisScale: string = settings.categoryAxis.axisType === "categorical" ? "linear" : settings.categoryAxis.axisScale;
        const axisType: string = !yIsScalar ? "categorical" : settings.categoryAxis.axisType;

        let dateColumnFormatter: valueFormatter.IValueFormatter;

        if (metadata.cols.category) {
            dateColumnFormatter = valueFormatter.create({
                format: valueFormatter.getFormatStringByColumn(<any>metadata.cols.category, true) || metadata.cols.category.format,
                cultureSelector: host.locale
            });
        } else if (metadata.groupingColumn) {
            dateColumnFormatter = valueFormatter.create({
                format: valueFormatter.getFormatStringByColumn(<any>metadata.groupingColumn, true) || metadata.groupingColumn.format,
                cultureSelector: host.locale
            });
        }

        const innerPadding: number = settings.categoryAxis.innerPadding / 100;
        const outerPadding: number = yIsScalar && axisType === "continuous" ? barHeight / 2 : 0;

        const fontSize: string = PixelConverter.toString(settings.categoryAxis.fontSize);
        const fontFamily: string = settings.categoryAxis.fontFamily;

        const skipCategoryRange: boolean = isSmallMultiple && settings.categoryAxis.rangeType !== AxisRangeType.Custom,
            startCategory: number| null = skipCategoryRange ? null : settings.categoryAxis.start,
            endCategory: number | null = skipCategoryRange ? null : settings.categoryAxis.end;

        const yAxisProperties = createAxis({
            pixelSpan: size.height,
            dataDomain: axesDomains.yAxisDomain,
            metaDataColumn: metadata.cols.category || metadata.groupingColumn,
            formatString: yAxisFormatString,
            outerPadding: outerPadding,
            innerPadding: innerPadding,
            orientation: convertPositionToAxisOrientation(settings.categoryAxis.position),
            scaleType: yIsScalar ? categoryAxisScale : undefined,
            isScalar: yIsScalar && axisType === "continuous",
            isVertical: true,
            isCategoryAxis: true,
            useTickIntervalForDisplayUnits: true,
            disableNice: axisType === "continuous" && (startCategory != null || endCategory != null),
            getValueFn: (index: number, dataType: valueType.ValueType): any => {
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

                    const formattedString: string = dateColumnFormatter.format(new Date(index).toLocaleString("en-US", options));

                    if (maxYLabelsWidth && axisType !== "continuous") {                            

                        const textProperties: TextProperties = {
                            text: formattedString,
                            fontFamily: fontFamily,
                            fontSize: fontSize
                        };

                        return  textMeasurementService.getTailoredTextOrDefault(textProperties, maxYLabelsWidth);
                    }

                    return formattedString;
                }
                
                if (maxYLabelsWidth && axisType !== "continuous") {                            

                    const textProperties: TextProperties = {
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
            .tickSizeInner(0)
            .tickSizeOuter(0);

        yAxisProperties.axisLabel = settings.categoryAxis.showTitle ? metadata.labels.y : "";

        return {
            x: xAxisProperties,
            y: yAxisProperties,
            yIsScalar
        };
    }

    public static render(settings: VisualSettings, xAxisSvgGroup: d3Selection<SVGElement>, yAxisSvgGroup: d3Selection<SVGElement>, axes: IAxes) {
        // Before rendering an axis, we need to remove an old one.
        // Otherwise, our visual will be cluttered by multiple axis objects, which can
        // // affect performance of our visual.
        // this.xAxisSvgGroup.selectAll("*").remove();
        // this.yAxisSvgGroup.selectAll("*").remove();

        // Now we call the axis funciton, that will render an axis on our visual.
        if (settings.valueAxis.show) {
            xAxisSvgGroup.call(axes.x.axis);
            const axisText = xAxisSvgGroup.selectAll("g").selectAll("text");
            const axisLines = xAxisSvgGroup.selectAll("g").selectAll("line");

            const color: string = settings.valueAxis.axisColor.toString();
            const fontSize: string = PixelConverter.toString(settings.valueAxis.fontSize);
            const fontFamily: string = settings.valueAxis.fontFamily;
            const gridlinesColor: string = settings.valueAxis.gridlinesColor.toString();
            const strokeWidth: string = PixelConverter.toString(settings.valueAxis.strokeWidth);
            const showGridlines: DataViewPropertyValue = settings.valueAxis.showGridlines;
            const lineStyle: DataViewPropertyValue = settings.valueAxis.lineStyle;

            const strokeDasharray = getLineStyleParam(lineStyle);

            axisText.style(
                "fill", color,
            )
            .style(
                "font-size", fontSize,
            )
            .style(
                "font-family", fontFamily
            );

            axisLines.style(
                "stroke", gridlinesColor,
            )
            .style(
                "stroke-width", strokeWidth,
            )
            .style(
                "stroke-dasharray", strokeDasharray
            );

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
            const axisText = yAxisSvgGroup.selectAll("g").selectAll("text");

            const color: string = settings.categoryAxis.axisColor.toString();
            const fontSize: string = PixelConverter.toString(settings.categoryAxis.fontSize);
            const fontFamily: string = settings.categoryAxis.fontFamily;

            axisText.style(
                "fill", color,
            )
            .style(
                "stroke", "none",
            )
            .style(
                "font-size", fontSize,
            )
            .style(
                "font-family", fontFamily
            );

        } else {
            yAxisSvgGroup.selectAll("*").remove();
        }

    }

    // eslint-disable-next-line max-lines-per-function
    public static renderLabels(
        viewport: IViewport,
        visualMargin: IMargin,
        visualSize: ISize,
        axisLabelsData: Array<string | null>,
        settings: VisualSettings,
        axes: IAxes,
        axisLabelsGroup: d3Selection<string | null>,
        axisGraphicsContext: d3Selection<SVGElement>) {

        const margin: IMargin = visualMargin,
            width: number = viewport.width,
            height: number = viewport.height,
            yAxisOrientation: string = "right",
            showY1OnRight: boolean = yAxisOrientation === settings.categoryAxis.position;

        const showYAxisTitle: boolean = settings.categoryAxis.show && settings.categoryAxis.showTitle;
        const showXAxisTitle: boolean = settings.valueAxis.show && settings.valueAxis.showTitle;

        if (!showXAxisTitle) {
            axisLabelsData[0] = null;
        }

        if (!showYAxisTitle) {
            axisLabelsData[1] = null;
        }

        axisLabelsGroup = axisGraphicsContext.selectAll("*")
            .data(axisLabelsData);

        // For removed categories, remove the SVG group.
        axisLabelsGroup.exit()
            .remove();

        // When a new category added, create a new SVG group for it.
        const axisLabelsGroupEnter = axisLabelsGroup.enter()
            .append("text")
            .attr("class", Selectors.AxisLabelSelector.className);

        const xColor: string = settings.valueAxis.axisTitleColor;
        const xFontSize: number = parseInt(settings.valueAxis.titleFontSize.toString());
        const xFontSizeString: string = PixelConverter.toString(xFontSize);
        const xTitle: DataViewPropertyValue = settings.valueAxis.axisTitle;
        const xAxisStyle: DataViewPropertyValue = settings.valueAxis.titleStyle;
        const xAxisFontFamily: string = settings.valueAxis.titleFontFamily;

        const yColor: string = settings.categoryAxis.axisTitleColor;
        const yFontSize: number = parseInt(settings.categoryAxis.titleFontSize.toString());
        const yFontSizeString: string = PixelConverter.toString(yFontSize);
        const yTitle: DataViewPropertyValue = settings.categoryAxis.axisTitle;
        const yAxisStyle: DataViewPropertyValue = settings.categoryAxis.titleStyle;
        const yAxisFontFamily: string = settings.categoryAxis.titleFontFamily;

        axisLabelsGroup
            .merge(axisLabelsGroupEnter)
            .style( "text-anchor", "middle" )
            .text(d => d)
            .call((text: d3Selection<any>) => {
                const textSelectionX: d3Selection<any> = select(text.nodes()[0]);

                textSelectionX.attr(
                    "transform", svg.translate(
                        (width) / RenderAxes.AxisLabelOffset,
                        (height + visualSize.height + xFontSize + margin.top) / 2),
                )
                .attr(
                    "dy", '.8em'
                );

                if (showXAxisTitle && xTitle && xTitle.toString().length > 0) {
                    textSelectionX.text(xTitle as string);
                }

                if (showXAxisTitle && xAxisStyle) {
                    const newTitle = getTitleWithUnitType(textSelectionX.text(), xAxisStyle, axes.x);

                    textSelectionX.text(newTitle);
                }

                textSelectionX.style(
                    "fill", xColor,
                )
                .style(
                    "font-size", xFontSizeString,
                )
                .style(
                    "font-family", xAxisFontFamily
                );

                const textSelectionY: d3Selection<any> = select(text.nodes()[1]);

                textSelectionY.attr(
                    "transform", showY1OnRight ? RenderAxes.YAxisLabelTransformRotate : RenderAxes.YAxisLabelTransformRotate,
                )
                .attr(
                    "y", showY1OnRight
                        ? width - margin.right - yFontSize
                        : 0,
                )
                .attr(
                    "x", -((visualSize.height + margin.top + margin.bottom) / RenderAxes.AxisLabelOffset),
                )
                .attr(
                    "dy", (showY1OnRight ? '-' : '') + RenderAxes.DefaultDY
                );

                if (showYAxisTitle && yTitle && yTitle.toString().length > 0) {
                    textSelectionY.text(yTitle as string);
                }

                if (showYAxisTitle) {
                    const newTitle = getTitleWithUnitType(textSelectionY.text(), yAxisStyle, axes.y);

                    textSelectionY.text(newTitle);
                }

                textSelectionY.style(
                    "fill", yColor,
                )
                .style(
                    "font-size", yFontSizeString,
                )
                .style(
                    "font-family", yAxisFontFamily
                );
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

        let minValue: number = min(allDatapoint, d => <number>d.value);
        let maxValue: number = max(allDatapoint, d => <number>d.value);

        minValue = minValue < 0 ? minValue : 0;
        maxValue = maxValue > 0 ? maxValue : 0;

        let dataDomainMinX: number = minValue;
        let dataDomainMaxX: number = maxValue;

        const constantLineValue: number = settings.constantLine.value;

        if (constantLineValue || constantLineValue === 0) {
            dataDomainMinX = dataDomainMinX > constantLineValue ? constantLineValue : dataDomainMinX;
            dataDomainMaxX = dataDomainMaxX < constantLineValue ? constantLineValue : dataDomainMaxX;
        }

        const skipStartEnd: boolean = isSmallMultiple && settings.valueAxis.rangeType !== AxisRangeType.Custom;

        const start = skipStartEnd ? null : settings.valueAxis.start;
        const end = skipStartEnd ? null : settings.valueAxis.end;

        if (start != null){
            dataDomainMinX = start;
        }

        if ( settings.valueAxis.axisScale === 'log' && dataDomainMinX === 0 ){
            dataDomainMinX = 1;
        }

        return [dataDomainMinX, end != null ? end : dataDomainMaxX]
    }

    private static Blank: string = "(Blank)";

    public static calculateCategoryDomain(visibleDatapoints: VisualDataPoint[], 
        settings: VisualSettings, 
        metadata: VisualMeasureMetadata, 
        isSmallMultiple: boolean = false): any[] { 
        
        const categoryType: valueType.ValueType = axis.getCategoryValueType(metadata.cols.category);
        const isOrdinal: boolean = axis.isOrdinal(categoryType);

        let dataDomainY = visibleDatapoints.map(d => <any>d.category);

        const yIsScalar: boolean = !isOrdinal;
        const axisType: string = !yIsScalar ? "categorical" : settings.categoryAxis.axisType;

        if (yIsScalar && axisType === "continuous") {
            dataDomainY = dataDomainY.filter(d => d !== this.Blank);
            const noBlankCategoryDatapoints: VisualDataPoint[] = visibleDatapoints.filter(d => d.category !== this.Blank);

            const dataDomainMinY: number = min(noBlankCategoryDatapoints, d => <number>d.category);
            const dataDomainMaxY: number = max(noBlankCategoryDatapoints, d => <number>d.category);

            const skipStartEnd: boolean = isSmallMultiple && settings.categoryAxis.rangeType !== AxisRangeType.Custom;

            const start = skipStartEnd ? null : settings.categoryAxis.start;
            const end = skipStartEnd ? null : settings.categoryAxis.end;

            dataDomainY = [start != null ? settings.categoryAxis.start : dataDomainMinY, end != null ? end : dataDomainMaxY];
        }

        return dataDomainY;
    }
}