"use strict";

import powerbiApi from "powerbi-visuals-api";
import { VisualMeasureMetadata } from "./visualInterfaces";

import DataViewMetadataColumn = powerbiApi.DataViewMetadataColumn;
import DataViewCategoryColumn = powerbiApi.DataViewCategoryColumn;
import DataViewValueColumnGroup = powerbiApi.DataViewValueColumnGroup;

import { dataRoleHelper } from "powerbi-visuals-utils-dataviewutils";
import getMeasureIndexOfRole = dataRoleHelper.getMeasureIndexOfRole;
import getCategoryIndexOfRole = dataRoleHelper.getCategoryIndexOfRole;

const ColumnCategory: string = "Axis";
const ColumnValue: string = "Value";
const ColumnGradient: string = "Gradient";
const ColumnColumnBy: string = 'ColumnBy';
const ColumnRowBy: string = 'RowBy';

export function getMetadata(
    categories: DataViewCategoryColumn[] | undefined,
    grouped: DataViewValueColumnGroup[] | undefined,
    source: DataViewMetadataColumn | undefined): VisualMeasureMetadata {

    let xAxisLabel: string = "",
        yAxisLabel: string = "",
        valueIndex = grouped && getMeasureIndexOfRole(grouped, ColumnValue),
        categoryIndex = categories && getCategoryIndexOfRole(categories, ColumnCategory),
        gradientIndex = grouped && getMeasureIndexOfRole(grouped, ColumnGradient),
        valueCol: DataViewMetadataColumn | undefined,
        categoryCol: DataViewMetadataColumn | undefined;


    if (grouped && grouped.length) {
        const firstGroup: DataViewValueColumnGroup = grouped[0];

        if (valueIndex !== undefined && valueIndex >= 0) {
            valueCol = firstGroup.values[valueIndex].source;
            xAxisLabel = firstGroup.values[valueIndex].source.displayName;
        }

        if (categoryIndex !== undefined && categoryIndex >= 0 && categories) {
            categoryCol = categories[categoryIndex].source;
            yAxisLabel = categories[categoryIndex].source.displayName;
        }
    }

    return {
        idx: {
            category: categoryIndex,
            value: valueIndex,
            gradient: gradientIndex,
            columnBy: categories && getCategoryIndexOfRole(categories, ColumnColumnBy),
            rowBy: categories && getCategoryIndexOfRole(categories, ColumnRowBy)
        },
        cols: {
            value: valueCol,
            category: categoryCol
        },
        labels: {
            x: xAxisLabel,
            y: yAxisLabel
        },
        groupingColumn: <any>source
    };
}