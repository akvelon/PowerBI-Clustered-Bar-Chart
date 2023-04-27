'use strict';

import powerbiApi from 'powerbi-visuals-api';
import DataView = powerbiApi.DataView;
import IVisualHost = powerbiApi.extensibility.visual.IVisualHost;
import DataViewValueColumns = powerbiApi.DataViewValueColumns;
import DataViewValueColumn = powerbiApi.DataViewValueColumn;
import DataViewCategoricalColumn = powerbiApi.DataViewValueColumn;
import DataViewMetadataColumn = powerbiApi.DataViewMetadataColumn;
import DataViewValueColumnGroup = powerbiApi.DataViewValueColumnGroup;
import VisualTooltipDataItem = powerbiApi.extensibility.VisualTooltipDataItem;
import ISelectionId = powerbiApi.visuals.ISelectionId;
import DataViewCategoryColumn = powerbiApi.DataViewCategoryColumn;
import PrimitiveValue = powerbiApi.PrimitiveValue;
import DataViewCategorical = powerbiApi.DataViewCategorical;

import {VisualColumns, VisualDataPoint} from './visualInterfaces';
import {converterHelper} from 'powerbi-visuals-utils-dataviewutils';
import {valueFormatter as ValueFormatter} from 'powerbi-visuals-utils-formattingutils';
import {ColorHelper} from 'powerbi-visuals-utils-colorutils';

import {VisualSettings} from './settings';

import {sum as d3sum} from 'd3-array';

export enum Field {
    Axis = <any>'Axis',
    Legend = <any>'Legend',
    Value = <any>'Value',
    Gradient = <any>'Gradient',
    ColumnBy = <any>'ColumnBy',
    RowBy = <any>'RowBy',
    Tooltips = <any>'Tooltips',
    GroupedValues = <any>'GroupedValues'
}

export class DataViewConverter {
    private static Highlighted: string = 'Highlighted';
    private static Blank: string = '(Blank)';
    private static percentFormatString: string = '#,0.00%';

    public static Convert(dataView: DataView, hostService: IVisualHost, settings: VisualSettings, legendColors: Array<string>): VisualDataPoint[] {

        if (this.IsAxisAndLegendSameField(dataView)) {
            return this.GetDataPointsForSameAxisAndLegend(dataView, hostService, legendColors);
        } else if (this.IsLegendFilled(dataView)) {
            return this.GetDataPointsForLegend(dataView, hostService, legendColors);
        } else if (this.IsMultipleValues(dataView)) {
            return this.GetDataPointsForMultipleValues(dataView, hostService, legendColors);
        }

        return this.GetDataPointsWithoutLegend(dataView, hostService, settings);
    }

    public static IsLegendNeeded(dataView: DataView) {
        return this.IsLegendFilled(dataView) || this.IsMultipleValues(dataView);
    }

    private static IsAxisAndLegendSameField(dataView: DataView): boolean {
        const columns: DataViewValueColumns | undefined = dataView?.categorical?.values;

        if (columns && columns.source && columns.source.roles && columns.source.roles[Field.Legend] && columns.source.roles[Field.Axis]) {
            return true;
        }

        return false;
    }

    public static IsCategoryFilled(dataView: DataView, categoryField: Field): boolean {
        if (dataView.categorical
            && dataView.categorical.values
            && dataView.categorical.values.source
            && dataView.categorical.values.source?.roles?.[categoryField]) {
            return true;
        }

        const columns: DataViewCategoricalColumn[] | undefined = dataView.categorical?.categories;

        if (columns && columns.filter(x => x.source && x.source.roles?.[categoryField]).length) {
            return true;
        }

        return false;
    }

    public static IsValueFilled(dataView: DataView): boolean {
        const columns: DataViewValueColumns | undefined = dataView.categorical?.values;

        if (!columns) {
            return false;
        }

        if (columns.source && columns.source.roles?.[Field.Value] || columns.filter(x => x.source && x.source.roles?.[Field.Value]).length) {
            return true;
        }

        return false;
    }

    public static IsLegendFilled(dataView: DataView): boolean {
        const columns: DataViewValueColumns | undefined = dataView.categorical?.values;

        if (columns && columns.source && columns.source.roles?.[Field.Legend]) {
            return true;
        }

        return false;
    }

    public static IsMultipleValues(dataView: DataView): boolean {
        const columns: DataViewMetadataColumn[] | undefined = dataView.metadata.columns;
        let valueFieldsCount: number = 0;

        for (const columnName in columns) {
            const column: DataViewMetadataColumn = columns[columnName];

            if (column.roles && column.roles[Field.Value]) {
                ++valueFieldsCount;
                if (valueFieldsCount > 1) {
                    return true;
                }
            }
        }

        return false;
    }

    // Legend bucket is filled
    private static GetDataPointsForSameAxisAndLegend(dataView: DataView, hostService: IVisualHost, legendColors: Array<string>): VisualDataPoint[] {
        const columns: VisualColumns = this.GetGroupedValueColumns(dataView);

        const data: VisualDataPoint[] = [];

        const seriesColumn: DataViewValueColumns = columns[Field.GroupedValues];
        const groupedValues: DataViewValueColumnGroup[] | null = seriesColumn.grouped ? seriesColumn.grouped() : null;

        columns[Field.Legend].forEach((legend, k) => {
            const value: number = columns[Field.Value][k].values[0];
            const color = legendColors[k];

            const tooltipItems: VisualTooltipDataItem[] = [];

            const groupMetadata: DataViewMetadataColumn = columns[Field.GroupedValues].source,
                valueMetadata: DataViewMetadataColumn = columns[Field.Value][k].source;

            tooltipItems.push(this.createTooltipData(groupMetadata, legend));
            tooltipItems.push(this.createTooltipData(valueMetadata, value));

            if (columns[Field.Tooltips] && columns[Field.Tooltips].length) {
                columns[Field.Tooltips].filter(x => x.source.groupName === legend).forEach(tooltipColumn => {
                    const tooltipValue = tooltipColumn.values[k],
                        tooltipMetadata: DataViewMetadataColumn = tooltipColumn.source;

                    tooltipItems.push(this.createTooltipData(tooltipMetadata, tooltipValue));
                });
            }

            let selectionBuilder = hostService.createSelectionIdBuilder();
            if (groupedValues) {
                selectionBuilder = selectionBuilder.withSeries(columns[Field.GroupedValues], groupedValues[k]);
            }
            if (seriesColumn[k].source.queryName) {
                selectionBuilder = selectionBuilder.withMeasure(seriesColumn[k].source.queryName || '');
            }
            const identity: ISelectionId = selectionBuilder.createSelectionId();

            if (value != null) {
                data.push({
                    category: legend !== 0 && !legend ? this.Blank : legend,
                    series: legend,
                    value: value,
                    shiftValue: 0,
                    selected: false,
                    identity: identity,
                    color: color,
                    tooltips: tooltipItems,
                });

                const highlightValue: number = columns[Field.Value][k].highlights ? columns[Field.Value][k].highlights[0] : null;

                if (highlightValue != null) {
                    const highlightTooltipItems: VisualTooltipDataItem[] = tooltipItems.slice();

                    highlightTooltipItems.push(this.createTooltipData(valueMetadata, highlightValue, this.Highlighted));

                    data.push({
                        category: legend !== 0 && !legend ? this.Blank : legend,
                        series: legend,
                        value: highlightValue,
                        shiftValue: 0,
                        selected: false,
                        identity: identity,
                        highlight: true,
                        color: color,
                        tooltips: highlightTooltipItems,
                    });
                }
            }
        });

        return data;
    }

    // Legend bucket is filled
    private static GetDataPointsForLegend(dataView: DataView, hostService: IVisualHost, legendColors: Array<string>): VisualDataPoint[] {
        const columns: VisualColumns = this.GetGroupedValueColumns(dataView);

        const data: VisualDataPoint[] = [];

        const categoryColumn: DataViewCategoryColumn = columns[Field.Axis][0],
            seriesColumn: DataViewValueColumns = columns[Field.GroupedValues],
            groupedValues: DataViewValueColumnGroup[] | null = seriesColumn.grouped ? seriesColumn.grouped() : null;

        categoryColumn.values.forEach((categoryValue, i) => {
            let sum: number = 0;

            const columnBy: PrimitiveValue = columns[Field.ColumnBy] && columns[Field.ColumnBy][0].values[i],
                rowBy: PrimitiveValue = columns[Field.RowBy] && columns[Field.RowBy][0].values[i];

            columns[Field.Legend].forEach((legend, k) => {
                const value: number = columns[Field.Value][k].values[i];
                const color = legendColors[k];


                let selectionBuilder = hostService.createSelectionIdBuilder();

                if (groupedValues) {
                    selectionBuilder = selectionBuilder
                        .withCategory(categoryColumn, i)
                        .withSeries(seriesColumn, groupedValues[k]);
                }
                if (seriesColumn[k].source.queryName) {
                    selectionBuilder = selectionBuilder.withMeasure(seriesColumn[k].source.queryName || '');
                }
                const identity: ISelectionId = selectionBuilder.createSelectionId();

                if (value != null) {
                    const tooltipItems: VisualTooltipDataItem[] = [];

                    const categoryMetadata: DataViewMetadataColumn = categoryColumn.source,
                        groupMetadata: DataViewMetadataColumn = columns[Field.GroupedValues].source,
                        valueMetadata: DataViewMetadataColumn = columns[Field.Value][k].source;

                    tooltipItems.push(this.createTooltipData(categoryMetadata, categoryValue));
                    tooltipItems.push(this.createTooltipData(groupMetadata, legend));
                    tooltipItems.push(this.createTooltipData(valueMetadata, value));

                    if (columns[Field.Tooltips] && columns[Field.Tooltips].length) {
                        columns[Field.Tooltips].filter(x => x.source.groupName === legend).forEach(tooltipColumn => {
                            const tooltipValue = tooltipColumn.values[i],
                                tooltipMetadata: DataViewMetadataColumn = tooltipColumn.source;

                            tooltipItems.push(this.createTooltipData(tooltipMetadata, tooltipValue));
                        });
                    }

                    data.push({
                        category: categoryValue !== 0 && !categoryValue ? '(Blank)' : categoryValue,
                        series: legend,
                        value: value,
                        shiftValue: sum,
                        selected: false,
                        identity: identity,
                        tooltips: tooltipItems,
                        color: color,
                        columnBy: columnBy,
                        rowBy: rowBy,
                    });

                    const highlightValue: number = columns[Field.Value][k].highlights ? columns[Field.Value][k].highlights[i] : null;

                    if (highlightValue != null) {
                        const highlightTooltipItems: VisualTooltipDataItem[] = tooltipItems.slice();

                        highlightTooltipItems.push(this.createTooltipData(valueMetadata, highlightValue, this.Highlighted));

                        data.push({
                            category: categoryValue !== 0 && !categoryValue ? '(Blank)' : categoryValue,
                            series: legend,
                            value: highlightValue,
                            shiftValue: sum,
                            selected: false,
                            identity: identity,
                            highlight: true,
                            tooltips: highlightTooltipItems,
                            color: color,
                            columnBy: columnBy,
                            rowBy: rowBy,
                        });
                    }
                }

                ++sum;
            });
        });

        return data;
    }

    // Legend bucket is empty. Used multiple fields in "Value" bucket
    private static GetDataPointsForMultipleValues(dataView: DataView, hostService: IVisualHost, legendColors: Array<string>): VisualDataPoint[] {
        const columns: VisualColumns = this.GetColumnsForMultipleValues(dataView);

        const data: VisualDataPoint[] = [];

        const categoryColumn: DataViewCategoryColumn = columns[Field.Axis][0];

        categoryColumn.values.forEach((category, i) => {
            let sum: number = 0;

            const columnBy: PrimitiveValue = columns[Field.ColumnBy] && columns[Field.ColumnBy][0].values[i],
                rowBy: PrimitiveValue = columns[Field.RowBy] && columns[Field.RowBy][0].values[i];

            columns[Field.Value].forEach((valueColumn, k) => {
                const value: number = valueColumn.values[i];
                const color = legendColors[k];

                let selectionBuilder = hostService.createSelectionIdBuilder()
                    .withCategory(categoryColumn, i);

                if (columns.Value?.[k].source.queryName) {
                    selectionBuilder = selectionBuilder.withMeasure(columns.Value[k].source.queryName);
                }

                const identity: ISelectionId = selectionBuilder.createSelectionId();

                if (value != null) {
                    const tooltipItems: VisualTooltipDataItem[] = [];

                    const categoryMetadata: DataViewMetadataColumn = categoryColumn.source,
                        valueMetadata: DataViewMetadataColumn = valueColumn.source;

                    tooltipItems.push(this.createTooltipData(categoryMetadata, category));
                    tooltipItems.push(this.createTooltipData(valueMetadata, value));

                    if (columns[Field.Tooltips] && columns[Field.Tooltips].length) {
                        columns[Field.Tooltips].forEach(tooltipColumn => {
                            const tooltipValue = tooltipColumn.values[i],
                                tooltipMetadata: DataViewMetadataColumn = tooltipColumn.source;

                            tooltipItems.push(this.createTooltipData(tooltipMetadata, tooltipValue));
                        });
                    }

                    data.push({
                        category: category !== 0 && !category ? '(Blank)' : category,
                        value: value,
                        shiftValue: sum,
                        selected: false,
                        identity: identity,
                        tooltips: tooltipItems,
                        color: color,
                        columnBy: columnBy,
                        rowBy: rowBy,
                    });

                    const highlightValue: number = valueColumn.highlights ? valueColumn.highlights[i] : null;

                    if (highlightValue != null) {
                        const highlightTooltipItems: VisualTooltipDataItem[] = tooltipItems.slice();

                        highlightTooltipItems.push(this.createTooltipData(valueMetadata, highlightValue, this.Highlighted));

                        data.push({
                            category: category !== 0 && !category ? '(Blank)' : category,
                            value: highlightValue,
                            shiftValue: sum,
                            selected: false,
                            identity: identity,
                            highlight: true,
                            tooltips: tooltipItems,
                            color: color,
                            columnBy: columnBy,
                            rowBy: rowBy,
                        });
                    }
                }

                ++sum;
            });
        });

        return data;
    }

    // Legend bucket is empty. Single field in "Value" bucket
    private static GetDataPointsWithoutLegend(dataView: DataView, hostService: IVisualHost, settings: VisualSettings): VisualDataPoint[] {
        const columns: VisualColumns = this.GetColumnsWithNoLegend(dataView);

        const data: VisualDataPoint[] = [];

        const categoryColumn: DataViewCategoryColumn = columns[Field.Axis][0];

        const colorHelper = new ColorHelper(
            hostService.colorPalette,
            {
                objectName: 'dataPoint',
                propertyName: 'fill',
            },
            settings.dataPoint.fill,
        );

        categoryColumn.values.forEach((category, i) => {
            const value: number = columns[Field.Value].values[i],
                colorSaturationCol = columns[Field.Gradient],
                colorSaturation: number = colorSaturationCol && colorSaturationCol.values[i] ? columns[Field.Gradient].values[i] : null;

            const columnBy: PrimitiveValue = columns[Field.ColumnBy] && columns[Field.ColumnBy][0].values[i],
                rowBy: PrimitiveValue = columns[Field.RowBy] && columns[Field.RowBy][0].values[i];


            const identity: ISelectionId = hostService.createSelectionIdBuilder()
                .withCategory(categoryColumn, i)
                .createSelectionId();

            if (value != null) {
                const color = colorHelper.getColorForMeasure(
                    categoryColumn.objects && categoryColumn.objects[i],
                    '');

                const tooltipItems: VisualTooltipDataItem[] = [];

                const categoryMetadata: DataViewMetadataColumn = categoryColumn.source,
                    valueMetadata: DataViewMetadataColumn = columns[Field.Value].source;

                tooltipItems.push(this.createTooltipData(categoryMetadata, category));
                tooltipItems.push(this.createTooltipData(valueMetadata, value));

                if (columns[Field.Tooltips] && columns[Field.Tooltips].length) {
                    columns[Field.Tooltips].forEach(tooltipColumn => {
                        const tooltipValue = tooltipColumn.values[i],
                            tooltipMetadata: DataViewMetadataColumn = tooltipColumn.source;

                        tooltipItems.push(this.createTooltipData(tooltipMetadata, tooltipValue));
                    });
                }

                data.push({
                    category: category !== 0 && !category ? '(Blank)' : category,
                    value: value,
                    shiftValue: 1,
                    colorSaturation: colorSaturation,
                    selected: false,
                    identity: identity,
                    color: color,
                    tooltips: tooltipItems,
                    columnBy: columnBy,
                    rowBy: rowBy,
                });

                const highlightValue: number = columns[Field.Value].highlights ? columns[Field.Value].highlights[i] : null;

                if (highlightValue != null) {
                    const highlightTooltipItems: VisualTooltipDataItem[] = tooltipItems.slice();

                    highlightTooltipItems.push(this.createTooltipData(valueMetadata, highlightValue, this.Highlighted));

                    data.push({
                        category: category !== 0 && !category ? '(Blank)' : category,
                        value: highlightValue,
                        shiftValue: 1,
                        selected: false,
                        identity: identity,
                        highlight: true,
                        color: color,
                        tooltips: highlightTooltipItems,
                        columnBy: columnBy,
                        rowBy: rowBy,
                    });
                }
            }
        });

        return data;
    }

    private static GetGroupedValueColumns(dataView: DataView): VisualColumns {
        const categorical: DataViewCategorical | undefined = dataView && dataView.categorical;
        const categories: DataViewCategoricalColumn[] = categorical && categorical.categories || [];
        const values: DataViewValueColumns | undefined = categorical && categorical.values;
        const series: PrimitiveValue[] | undefined = categorical && values?.source && this.getSeriesValues(dataView);
        const grouped: DataViewValueColumnGroup[] | undefined = values && values.grouped();

        const data: VisualColumns = new VisualColumns();

        if (grouped) {
            data[Field.GroupedValues] = values;

            grouped.forEach(x => {
                for (const prop in data) {
                    const columnArray: DataViewValueColumn[] = x.values.filter(y => y.source.roles?.[prop]);

                    if (columnArray.length) {
                        if (!data[prop]) {
                            data[prop] = columnArray;
                        } else {
                            data[prop].push(...columnArray);
                        }
                    }
                }
            });
        }

        if (categorical) {
            for (const prop in data) {
                const columnArray: DataViewValueColumn[] = <DataViewValueColumn[]>categories.filter(y => y.source.roles?.[prop]);

                if (columnArray.length) {
                    data[prop] = columnArray;
                }
            }
        }

        if (series) {
            data[Field.Legend] = series.filter((v, i, a) => a.indexOf(v) === i);
        }

        return data;
    }

    private static GetColumnsForMultipleValues(dataView: DataView): VisualColumns {
        const categorical: DataViewCategorical | undefined = dataView && dataView.categorical;
        const categories: DataViewCategoricalColumn[] = categorical && categorical.categories || [];
        const values: DataViewValueColumns | undefined = categorical && categorical.values;

        const data: VisualColumns = new VisualColumns();

        if (categorical && values) {
            const valueColumns: DataViewValueColumn[] = values.filter(y => y.source.roles?.[Field.Value]);

            if (valueColumns.length) {
                if (!data[Field.Value]) {
                    data[Field.Value] = valueColumns;
                }
            }

            const toolipColumns: DataViewValueColumn[] = values.filter(y => y.source.roles?.[Field.Tooltips]);

            if (toolipColumns.length) {
                if (!data[Field.Tooltips]) {
                    data[Field.Tooltips] = toolipColumns;
                }
            }

            for (const prop in data) {
                const columnArray: DataViewValueColumn[] = <DataViewValueColumn[]>categories.filter(y => y.source.roles?.[prop]);

                if (columnArray.length) {
                    data[prop] = columnArray;
                }
            }
        }

        return data;
    }

    private static GetColumnsWithNoLegend(dataView: DataView): VisualColumns {
        const categorical: DataViewCategorical | undefined = dataView && dataView.categorical;
        const categories: DataViewCategoricalColumn[] = categorical && categorical.categories || [];
        const values: DataViewValueColumns | undefined = categorical && categorical.values;

        const data: VisualColumns = new VisualColumns();

        if (categorical && values) {
            const valueColumns: DataViewValueColumn[] = values.filter(y => y.source.roles?.[Field.Value]);

            if (valueColumns.length) {
                if (!data[Field.Value]) {
                    data[Field.Value] = valueColumns[0];
                }
            }

            const toolipColumns: DataViewValueColumn[] = values.filter(y => y.source.roles?.[Field.Tooltips]);

            if (toolipColumns.length) {
                if (!data[Field.Tooltips]) {
                    data[Field.Tooltips] = toolipColumns;
                }
            }

            for (const prop in data) {
                const columnArray: DataViewValueColumn[] = <DataViewValueColumn[]>categories.filter(y => y.source.roles?.[prop]);

                if (columnArray.length) {
                    data[prop] = columnArray;
                }
            }
        }

        return data;
    }

    private static createTooltipData(metadataColumn: DataViewMetadataColumn, value: PrimitiveValue, displayName?: string): VisualTooltipDataItem {
        return {
            displayName: displayName ? displayName : metadataColumn.displayName,
            value: this.getFormattedValue(metadataColumn, value) || '',
        };
    }

    private static getSeriesValues(dataView: DataView): PrimitiveValue[] | undefined {
        return dataView && dataView.categorical && dataView.categorical.values
            && dataView.categorical.values.map(x => converterHelper.converterHelper.getSeriesName(x.source));
    }

    private static getFormattedValue(column: DataViewMetadataColumn, value: any): string | undefined {
        const formatString: string | undefined = this.getFormatStringFromColumn(column);

        return ValueFormatter.format(value, formatString);
    }

    private static getFormatStringFromColumn(column: DataViewMetadataColumn): string {
        if (column) {
            const formatString: string = ValueFormatter.getFormatStringByColumn(<any>column, false);

            return formatString || column.format;
        }

        return null;
    }
}
