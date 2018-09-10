module powerbi.extensibility.visual.visualUtils {
    type ScrollBarAction = 'disable';

    export enum ScrollbarState {
        Disable = <any>"disable",
        Enable = <any>"enable"
    }

    interface ScrollBarSettings {
        readonly trackSize; // Considered as width for vertical mode and as height for horizontal mode
        readonly trackMargin; // Margin between track and visual
        minCategorySpace: number; // Minimum of space needed for rendering one category
    }

    interface Scrolling {
        active: boolean;
        mousedownClientY: number;
        mousemoveStartY: number;
        currentY: number;
        positionsCount: number;
        currentPosition: number;
    }
    interface Track {
        el: d3.Selection<HTMLElement>;
        left: number;
        top: number;
        width: number;
        height: number;
        availableScrollDistance: number;
    }

    export class ScrollBar {
        readonly settings: ScrollBarSettings = {
            trackSize: 10,
            trackMargin: 10,
            minCategorySpace: 25
        };

        // Easiest way to allow/disallow scrollbar functionality
        private readonly allow: boolean = true;
        private enabled: boolean = false;
        private visual: Visual;
        private scrolling: Scrolling = {
            active: false,
            mousedownClientY : 0,
            mousemoveStartY: 0,
            currentY: 0,
            positionsCount: 0,
            currentPosition: 0
        };
        private visibleDataPoints: VisualDataPoint[];
        private visibleDataPointsByCategories: CategoryDataPoints[];
        // Maximum of bars that can appear at the same time
        private capacity: number;
        private htmlElement: d3.Selection<HTMLElement>;
        private mainElement: d3.Selection<HTMLElement>;
        private track: Track = {
            el: null,
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            availableScrollDistance: 1 // Must not be 0 because appears as the denominator
        };
        private handle: d3.Selection<HTMLElement>;

        constructor(visual: Visual) {
            this.visual = visual;
        }

        init(mainElement: d3.Selection<HTMLElement>): void {
            this.htmlElement = d3.select('html');
            this.mainElement = mainElement;
            this.track.el = this.mainElement.append('div').classed('scrollbar-track', true);
            this.handle = this.track.el.append('button').classed('scrollbar-handle', true);

            this.handle.on('mousedown', () => { this.onMousedown(); });
            this.htmlElement
                .on('mousemove', () => { this.onMousemove(); })
                .on('mouseup', () => { this.onMouseup(); });
            this.mainElement.on('wheel', () => { this.onMousewheel(); });
        }

        update(): void {
            if ( !this.enabled ) {
                return;
            }
            this.updateMeasurements();
        }

        updateData(action: ScrollbarState, updateType: VisualUpdateType): void {
            this.settings.minCategorySpace =  this.visual.getSettings().categoryAxis.minCategoryWidth;

            let availableSpace: number = this.visual.viewport.height - this.visual.visualMargin.top - this.visual.visualMargin.bottom;

            this.capacity = Math.floor(availableSpace / this.settings.minCategorySpace);
            this.scrolling.positionsCount = this.visual.allUniqueCategories.length - this.capacity;

            if ( this.allow && action === ScrollbarState.Enable && this.scrolling.positionsCount > 0 ) {
                this.enable();
                const resizeEndCode = 36; // It's incorrect in the VisualUpdateType enum for some reason
                if ( updateType === VisualUpdateType.Resize || updateType === resizeEndCode ){
                    this.correctScrollingPosition();
                } else {
                    this.updateScrollingPosition(0);
                }
                this.updateHandlerTranslateY(true);
                this.determineDataOfVisibleItems();
            } else {
                this.disable();
            }
        }

        isEnabled(): boolean {
            return this.enabled;
        }

        getScrollPosition(): number {
            return this.scrolling.currentPosition;
        }

        getVisibleDataPoints(): VisualDataPoint[] {
            return this.visibleDataPoints;
        }

        getIndexOfFirstVisibleDataPoint(): number {
            let allDataPoints: VisualDataPoint[] = this.visual.getAllDataPoints();
            let firstVisibleDataPoint: VisualDataPoint = this.visibleDataPoints[0];

            for (let i: number = 0; i < allDataPoints.length; i++) {
                if (allDataPoints[i] === firstVisibleDataPoint) {
                    return i;
                }
            }
            return null;
        }

        private onMousedown(): void {
            if ( !this.enabled ) {
                return;
            }
            let e = d3.event as MouseEvent;
            this.scrolling.mousedownClientY = e.clientY;
            this.scrolling.active = true;
            this.scrolling.mousemoveStartY = this.scrolling.currentY;
        }

        private onMousemove(): void {
            if ( !this.scrolling.active ) {
                return;
            }

            let e = d3.event as MouseEvent;

            this.scrolling.currentY = this.scrolling.mousemoveStartY + (e.clientY - this.scrolling.mousedownClientY);

            this.updateHandlerTranslateY();
            this.updateScrollingPosition();
            this.determineDataOfVisibleItems();
            this.visual.onScrollPosChanged();
        }

        private onMouseup(): void {
            if ( !this.scrolling.active ) {
                return;
            }
            this.scrolling.active = false;
            this.scrolling.mousemoveStartY = 0;
        }

        private onMousewheel(): void {
            if ( !this.enabled ) {
                return;
            }
            let e = d3.event as WheelEvent;
            if ( e.deltaY > 0 ) {
                this.updateScrollingPosition(1, true);
            } else {
                this.updateScrollingPosition(-1, true);
            }

            this.updateHandlerTranslateY(true);
            this.determineDataOfVisibleItems();
            this.visual.onScrollPosChanged();
        }

        private enable(): void {
            this.enabled = true;
            this.track.el.style('display', 'block');
        }

        private disable(): void {
            this.enabled = false;
            this.visibleDataPoints = this.visual.getAllDataPoints();
            this.track.el.style('display', '');
        }

        private determineDataOfVisibleItems(): void {
            this.visibleDataPointsByCategories = [];
            this.visibleDataPoints = [];

            let dataPointsByCategories: CategoryDataPoints[] = this.visual.getDataPointsByCategories();

            for (let categoryIndex: number = 0; categoryIndex < dataPointsByCategories.length; categoryIndex++) {
                if ( categoryIndex < this.scrolling.currentPosition) {
                    continue;
                }

                if ( categoryIndex >= this.scrolling.currentPosition + this.capacity ) {
                    break;
                }

                this.visibleDataPointsByCategories.push( dataPointsByCategories[categoryIndex] );
                // Add all items of this category
                this.visibleDataPoints.push( ...dataPointsByCategories[categoryIndex].dataPoints );
            }
        }

        private correctScrollingPosition(){
            // Correcting the value if it goes beyond the limits
            if ( this.scrolling.currentPosition < 0 ) {
                this.scrolling.currentPosition = 0;
            } else if ( this.scrolling.currentPosition >= this.scrolling.positionsCount ) {
                this.scrolling.currentPosition = this.scrolling.positionsCount;
            }
        }

        private updateScrollingPosition(newValue?: number, relative?: boolean): void {
            if ( newValue == null ) {
                // Default parameterless case: calculate the value based on handle position
                this.scrolling.currentPosition = Math.round(this.scrolling.currentY / this.track.availableScrollDistance * this.scrolling.positionsCount);
            } else if ( relative ) {
                // Increase or decrease basing on current value
                this.scrolling.currentPosition += newValue;
            } else {
                // Set a defined point
                this.scrolling.currentPosition = newValue;
            }

            this.correctScrollingPosition();
        }

        private updateMeasurements(): void {
            let visualMargin: IMargin = this.visual.visualMargin;
            const track: Track = this.track;

            track.width = this.settings.trackSize;
            track.height = this.visual.visualSize.height;
            track.top = visualMargin.top;
            track.left = this.visual.viewport.width - this.settings.trackSize;

            let legendPosition = this.visual.settings.legend.position;

            if ( legendPosition === 'Top' || legendPosition === 'TopCenter' ) {
                track.top += this.visual.legendSize.height;
            } else if ( legendPosition === 'Right' || legendPosition === 'RightCenter' ) {
                track.left -= this.visual.legendSize.width;
            }

            track.el.style({
                top: this.track.top + 'px',
                left: this.track.left + 'px',
                height: this.track.height + 'px',
                width: this.track.width + 'px'
            });

            let visibleCategoriesCount: number = this.visibleDataPointsByCategories.length;
            let allCategoriesCount: number = this.visual.getDataPointsByCategories().length;
            let handleHeight: number = track.height * (visibleCategoriesCount / allCategoriesCount);
            this.handle.style('height', handleHeight + 'px');

            track.availableScrollDistance = track.height - handleHeight;
        }

        private updateHandlerTranslateY(byScrollingPosition?: boolean): void {
            if ( byScrollingPosition ) {
                this.scrolling.currentY = Math.round( this.scrolling.currentPosition / this.scrolling.positionsCount * this.track.availableScrollDistance );
            }

            if ( this.scrolling.currentY < 0 ) {
                this.scrolling.currentY = 0;
            } else if ( this.scrolling.currentY > this.track.availableScrollDistance) {
                this.scrolling.currentY = this.track.availableScrollDistance;
            }

            this.handle.style('transform', `translateY(${this.scrolling.currentY}px)`);
        }
    }
}