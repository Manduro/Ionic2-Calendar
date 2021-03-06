import { DatePipe } from '@angular/common';
import { Slides } from 'ionic-angular';
import { Component, OnInit, OnChanges, Input, Output, EventEmitter, SimpleChanges, ViewChild } from '@angular/core';

import { ICalendarComponent, IDisplayEvent, IEvent, ITimeSelected, IRange, IWeekView, IWeekViewRow, IWeekViewDateRow, CalendarMode } from './calendar';
import { CalendarService } from './calendar.service';

@Component({
    selector: 'weekview',
    template: `
        <ion-slides #weekSlider [options]="slideOption" (ionDidChange)="onSlideChanged()">
            <ion-slide *ngFor="let view of views; let viewIndex=index">
                <ion-row class="header-row">
                    <ion-col class="hour-column"></ion-col>
                    <ion-col *ngFor="let dt of view.dates">
                        {{ dt.date | date: formatWeekViewDayHeader }}
                    </ion-col>
                </ion-row>
                <ion-scroll scrollY="true" class="hour-rows-scroll">
                    <ion-row *ngFor="let row of view.rows" class="hour-row">
                        <ion-col class="hour-column">
                            {{ row[0].time | date: formatHourColumn }}
                        </ion-col>
                        <ion-col *ngFor="let tm of row" (click)="select(tm.time, tm.events)">
                            <div [class.calendar-event-wrap]="tm.events" *ngIf="tm.events">
                                <div *ngFor="let displayEvent of tm.events" class="calendar-event"
                                        (click)="eventSelected(displayEvent.event)"
                                        [style.top]="(65 * displayEvent.startOffset / hourParts) + 'px'"
                                        [style.left]="100 / displayEvent.overlapNumber * displayEvent.position + '%'"
                                        [style.width]="100 / displayEvent.overlapNumber + '%'"
                                        [style.height]="65 * (displayEvent.endIndex - displayEvent.startIndex - (displayEvent.endOffset + displayEvent.startOffset) / hourParts) + 'px'">
                                    <div class="calendar-event-inner">{{ displayEvent.event.title }}</div>
                                </div>
                            </div>
                        </ion-col>
                    </ion-row>
                </ion-scroll>
            </ion-slide>
        </ion-slides>
    `,
    styles: [`
        .swiper-slide {
            font-size: 14px;
            align-items: flex-start;
        }

        .slide-zoom {
          height: 100%;
        }

        ion-col {
            padding: 0;
        }

        .header-row {
            line-height: 40px;
        }

        .header-row ion-col {
          overflow: hidden;
          white-space: nowrap;
        }

        .header-row ion-col:not(.hour-column) {
            border-bottom: 0.5px solid #ddd;
        }

        .allday-row {
          position: relative;
        }

        .allday-row ion-scroll,
        .allday-row .scroll-zoom-wrapper {
            height: 50px;
        }

        .hour-column {
            flex: 0 0 40px;
            max-width: 40px;
        }

        .hour-rows-scroll {
          overflow: hidden;
          left: 0;
          right: 0;
          top: 40px;
          bottom: 0;
          position: absolute;
        }

        .hour-row {
            height: 65px;
        }

        .hour-row ion-col:not(.hour-column) {
            border-bottom: 0.5px solid #ddd;
            border-right: 0.5px solid #ddd;
        }

        .calendar-event-wrap {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .calendar-event {
          position: absolute;
          padding: 1px;
          cursor: pointer;
          z-index: 10000;
        }

        .calendar-event-inner {
          overflow: hidden;
          background-color: #3a87ad;
          color: white;
          height: 100%;
          width: 100%;
          padding: 2px;
          line-height: 15px;
        }

        ::-webkit-scrollbar,
        *::-webkit-scrollbar {
          display: none;
        }
    `]
})
export class WeekViewComponent implements ICalendarComponent, OnInit, OnChanges {
    @ViewChild('weekSlider') slider: Slides;

    @Input() formatWeekTitle: string;
    @Input() formatWeekViewDayHeader: string;
    @Input() formatHourColumn: string;
    @Input() startingDayWeek: number;
    @Input() allDayLabel: string;
    @Input() hourParts: number;
    @Input() eventSource: IEvent[];

    @Output() onRangeChanged = new EventEmitter<IRange>();
    @Output() onEventSelected = new EventEmitter<IEvent>();
    @Output() onTimeSelected = new EventEmitter<ITimeSelected>();
    @Output() onTitleChanged = new EventEmitter<string>();

    public slideOption = {
        runCallbacksOnInit: false,
        loop: true
    };
    public views: IWeekView[] = [];
    public currentViewIndex = 0;
    public range: IRange;
    public direction = 0;
    public mode: CalendarMode = 'week';

    private inited = false;

    constructor(private calendarService: CalendarService) {}

    ngOnInit() {
        this.inited = true;
        this.refreshView();

        this.calendarService.currentDateChanged$.subscribe(currentDate => {
            this.refreshView();
        });
    }

    ngOnChanges(changes: SimpleChanges) {
        if (!this.inited) return;

        let eventSourceChange = changes['eventSource'];
        if (eventSourceChange && eventSourceChange.currentValue) {
            this.onDataLoaded();
        }
    }

    onSlideChanged() {
        let s = (<any>this.slider.getSlider());
        console.log('slidechanged', s);
        let oldIndex = s.activeIndex - s.loopedSlides;
        s.destroyLoop();
        s.createLoop();
        s.update();
        s.slideTo(oldIndex + s.loopedSlides, 0, false);

        setTimeout(() => {
            let currentSlideIndex = this.slider.getActiveIndex(),
                direction = 0,
                currentViewIndex = this.currentViewIndex;

            currentSlideIndex = (currentSlideIndex + 2) % 3;
            if (currentSlideIndex - currentViewIndex === 1) {
                direction = 1;
            } else if (currentSlideIndex === 0 && currentViewIndex === 2) {
                direction = 1;
                this.slider.slideTo(1, 0, false);
            } else if (currentViewIndex - currentSlideIndex === 1) {
                direction = -1;
            } else if (currentSlideIndex === 2 && currentViewIndex === 0) {
                direction = -1;
                this.slider.slideTo(3, 0, false);
            }
            this.currentViewIndex = currentSlideIndex;
            this.move(direction);
        }, 200);
    }

    move(direction: number) {
        if (direction === 0) return;

        this.direction = direction;
        let adjacent = this.calendarService.getAdjacentCalendarDate(this.mode, direction);
        this.calendarService.currentDate = adjacent;
        this.direction = 0;
    }

    static createDateObjects(startTime: Date): IWeekViewRow[][] {
        let times: IWeekViewRow[][] = [],
            currentHour = startTime.getHours(),
            currentDate = startTime.getDate();

        for (let hour = 0; hour < 24; hour += 1) {
            let row: IWeekViewRow[] = [];
            for (let day = 0; day < 7; day += 1) {
                let time = new Date(startTime.getTime());
                time.setHours(currentHour + hour);
                time.setDate(currentDate + day);
                row.push({
                    events: [],
                    time: time
                });
            }
            times.push(row);
        }
        return times;
    }

    static getDates(startTime: Date, n: number): IWeekViewDateRow[] {
        let dates = new Array(n),
            current = new Date(startTime.getTime()),
            i = 0;
        current.setHours(12); // Prevent repeated dates because of timezone bug
        while (i < n) {
            dates[i++] = {
                date: new Date(current.getTime()),
                events: []
            };
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    getViewData(startTime: Date): IWeekView {
        return {
            rows: WeekViewComponent.createDateObjects(startTime),
            dates: WeekViewComponent.getDates(startTime, 7)
        };
    }

    getRange(currentDate: Date): IRange {
        let year = currentDate.getFullYear(),
            month = currentDate.getMonth(),
            date = currentDate.getDate(),
            day = currentDate.getDay(),
            difference = day - this.startingDayWeek;

        if (difference < 0) {
            difference += 7;
        }

        let firstDayOfWeek = new Date(year, month, date - difference);
        let endTime = new Date(year, month, date - difference + 7);

        return {
            startTime: firstDayOfWeek,
            endTime: endTime
        };
    }

    onDataLoaded() {
        let eventSource = this.eventSource,
            len = eventSource ? eventSource.length : 0,
            oneHour = 3600000,
            oneDay = 86400000,
            // add allday eps
            eps = 0.016,
            allDayEventInRange = false,
            normalEventInRange = false;

        let views: {
            startTime: Date;
            endTime: Date;
            index: number;
            utcStartTime?: Date;
            utcEndTime?: Date;
            rows?: IWeekViewRow[][];
            dates?: IWeekViewDateRow[];
        }[] = [{ // Current
            startTime: this.range.startTime,
            endTime: this.range.endTime,
            index: this.currentViewIndex
        }, { // Next
            startTime: new Date(this.range.startTime.getTime() + (1000 * 60 * 60 * 24 * 7)),
            endTime: new Date(this.range.endTime.getTime() + (1000 * 60 * 60 * 24 * 7)),
            index: (this.currentViewIndex + 1) % 3
        }, { // Previous
            startTime: new Date(this.range.startTime.getTime() - (1000 * 60 * 60 * 24 * 7)),
            endTime: new Date(this.range.endTime.getTime() - (1000 * 60 * 60 * 24 * 7)),
            index: (this.currentViewIndex + 2) % 3
        }];

        let dstCheckNext = views[0].endTime.getTimezoneOffset() - views[0].startTime.getTimezoneOffset();
        if (dstCheckNext !== 0) {
            views[1].startTime = new Date(views[1].startTime.getTime() + dstCheckNext * 60000);
        }
        let dstCheckPrev = views[2].startTime.getTimezoneOffset() - views[2].endTime.getTimezoneOffset();
        if (dstCheckPrev !== 0) {
            views[2].startTime = new Date(views[2].startTime.getTime() + dstCheckPrev * 60000);
        }

        for (let i = 0; i < 3; i += 1) {
            let timeZoneOffsetStart = -views[i].startTime.getTimezoneOffset();
            let timeZoneOffsetEnd = -views[i].endTime.getTimezoneOffset();

            views[i].utcStartTime = new Date(views[i].startTime.getTime() + timeZoneOffsetStart * 60000);
            views[i].utcEndTime = new Date(views[i].endTime.getTime() + timeZoneOffsetEnd * 60000);
            views[i].rows = this.views[views[i].index].rows;
            views[i].dates = this.views[views[i].index].dates;

            for (let day = 0; day < 7; day += 1) {
                views[i].dates[day].events = [];
                for (let hour = 0; hour < 24; hour += 1) {
                    views[i].rows[hour][day].events = [];
                }
            }
        }

        for (let i = 0; i < len; i += 1) {
            let event = eventSource[i];
            let eventStartTime = new Date(event.startTime.getTime());
            let eventEndTime = new Date(event.endTime.getTime());

            if (event.allDay) {
                if (eventEndTime <= views[2].utcStartTime || eventStartTime >= views[1].utcEndTime) {
                    continue;
                } else {
                    let view: number;
                    if (eventEndTime <= views[0].utcStartTime) {
                        view = 2;
                    } else if (eventStartTime >= views[0].utcEndTime) {
                        view = 1;
                    } else {
                        view = 0;
                    }
                    allDayEventInRange = true;

                    let allDayStartIndex: number;
                    if (eventStartTime <= views[view].utcStartTime) {
                        allDayStartIndex = 0;
                    } else {
                        allDayStartIndex = Math.floor((eventStartTime.getTime() - views[view].utcStartTime.getTime()) / oneDay);
                    }

                    let allDayEndIndex: number;
                    if (eventEndTime >= views[view].utcEndTime) {
                        allDayEndIndex = Math.ceil((views[view].utcEndTime.getTime() - views[view].utcStartTime.getTime()) / oneDay);
                    } else {
                        allDayEndIndex = Math.ceil((eventEndTime.getTime() - views[view].utcStartTime.getTime()) / oneDay);
                    }

                    let displayAllDayEvent: IDisplayEvent = {
                        event: event,
                        startIndex: allDayStartIndex,
                        endIndex: allDayEndIndex
                    };

                    let eventSet = views[view].dates[allDayStartIndex].events;
                    if (eventSet) {
                        eventSet.push(displayAllDayEvent);
                    } else {
                        eventSet = [];
                        eventSet.push(displayAllDayEvent);
                        views[view].dates[allDayStartIndex].events = eventSet;
                    }
                }
            } else {
                if (eventEndTime <= views[2].startTime || eventStartTime >= views[1].endTime) {
                    continue;
                } else {
                    let view: number;
                    if (eventEndTime <= views[0].startTime) {
                        view = 2;
                    } else if (eventStartTime >= views[0].endTime) {
                        view = 1;
                    } else {
                        view = 0;
                    }
                    normalEventInRange = true;

                    let timeDifferenceStart: number;
                    if (eventStartTime <= views[view].startTime) {
                        timeDifferenceStart = 0;
                    } else {
                        timeDifferenceStart = (eventStartTime.getTime() - views[view].startTime.getTime()) / oneHour;
                    }

                    let timeDifferenceEnd: number;
                    if (eventEndTime >= views[view].endTime) {
                        timeDifferenceEnd = (views[view].endTime.getTime() - views[view].startTime.getTime()) / oneHour;
                    } else {
                        timeDifferenceEnd = (eventEndTime.getTime() - views[view].startTime.getTime()) / oneHour;
                    }

                    let startIndex = Math.floor(timeDifferenceStart),
                        endIndex = Math.ceil(timeDifferenceEnd - eps),
                        startRowIndex = startIndex % 24,
                        dayIndex = Math.floor(startIndex / 24),
                        endOfDay = dayIndex * 24,
                        startOffset = 0,
                        endOffset = 0;

                    if (this.hourParts !== 1) {
                        startOffset = Math.floor((timeDifferenceStart - startIndex) * this.hourParts);
                    }

                    do {
                        endOfDay += 24;
                        let endRowIndex: number;
                        if (endOfDay <= endIndex) {
                            endRowIndex = 24;
                        } else {
                            endRowIndex = endIndex % 24;
                            if (this.hourParts !== 1) {
                                endOffset = Math.floor((endIndex - timeDifferenceEnd) * this.hourParts);
                            }
                        }
                        let displayEvent = {
                            event: event,
                            startIndex: startRowIndex,
                            endIndex: endRowIndex,
                            startOffset: startOffset,
                            endOffset: endOffset
                        };
                        let eventSet = views[view].rows[startRowIndex][dayIndex].events;
                        if (eventSet) {
                            eventSet.push(displayEvent);
                        } else {
                            eventSet = [];
                            eventSet.push(displayEvent);
                            views[view].rows[startRowIndex][dayIndex].events = eventSet;
                        }
                        startRowIndex = 0;
                        startOffset = 0;
                        dayIndex += 1;
                    } while (endOfDay < endIndex);
                }
            }
        }

        for (let i = 0; i < 3; i += 1) {
            if (normalEventInRange) {
                for (let day = 0; day < 7; day += 1) {
                    let orderedEvents: IDisplayEvent[] = [];
                    for (let hour = 0; hour < 24; hour += 1) {
                        if (views[i].rows[hour][day].events) {
                            views[i].rows[hour][day].events.sort(WeekViewComponent.compareEventByStartOffset);
                            orderedEvents = orderedEvents.concat(views[i].rows[hour][day].events);
                        }
                    }
                    if (orderedEvents.length > 0) {
                        this.placeEvents(orderedEvents);
                    }
                }
            }

            if (allDayEventInRange) {
                let orderedAllDayEvents: IDisplayEvent[] = [];
                for (let day = 0; day < 7; day += 1) {
                    if (views[i].dates[day].events) {
                        orderedAllDayEvents = orderedAllDayEvents.concat(views[i].dates[day].events);
                    }
                }
                if (orderedAllDayEvents.length > 0) {
                    this.placeAllDayEvents(orderedAllDayEvents);
                }
            }
        }
    }

    refreshView() {
        this.range = this.getRange(this.calendarService.currentDate);
        let title = this.getTitle();
        this.onTitleChanged.emit(title);

        this.calendarService.populateAdjacentViews(this);
        this.calendarService.rangeChanged(this);
    }

    getTitle(): string {
        let firstDayOfWeek = this.range.startTime,
            weekFormat = '$n',
            weekNumberIndex = this.formatWeekTitle.indexOf(weekFormat),
            title = new DatePipe().transform(firstDayOfWeek, this.formatWeekTitle);

        if (weekNumberIndex !== -1) {
            let weekNumber = String(WeekViewComponent.getISO8601WeekNumber(firstDayOfWeek));
            title = title.replace(weekFormat, weekNumber);
        }

        return title;
    }

    private static getISO8601WeekNumber(date: Date): number {
        let checkDate = new Date(date.getTime());
        checkDate.setDate(checkDate.getDate() + 4 - (checkDate.getDay() || 7)); // Thursday
        let time = checkDate.getTime();
        checkDate.setMonth(0); // Compare with Jan 1
        checkDate.setDate(1);
        return Math.floor(Math.round((time - checkDate.getTime()) / 86400000) / 7) + 1;
    }

    private static compareEventByStartOffset(eventA: IDisplayEvent, eventB: IDisplayEvent): number {
        return eventA.startOffset - eventB.startOffset;
    }

    select(selectedTime: Date, events: IDisplayEvent[]) {
        this.onTimeSelected.emit({
            selectedTime: selectedTime,
            events: events.map(e => e.event)
        });
    }

    placeEvents(orderedEvents: IDisplayEvent[]) {
        this.calculatePosition(orderedEvents);
        WeekViewComponent.calculateWidth(orderedEvents);
    }

    placeAllDayEvents(orderedEvents: IDisplayEvent[]) {
        this.calculatePosition(orderedEvents);
    }

    overlap(event1: IDisplayEvent, event2: IDisplayEvent): boolean {
        let earlyEvent = event1,
            lateEvent = event2;
        if (event1.startIndex > event2.startIndex || (event1.startIndex === event2.startIndex && event1.startOffset > event2.startOffset)) {
            earlyEvent = event2;
            lateEvent = event1;
        }

        if (earlyEvent.endIndex <= lateEvent.startIndex) {
            return false;
        } else {
            return !(earlyEvent.endIndex - lateEvent.startIndex === 1 && earlyEvent.endOffset + lateEvent.startOffset > this.hourParts);
        }
    }

    calculatePosition(events: IDisplayEvent[]) {
        let len = events.length,
            maxColumn = 0,
            isForbidden = new Array(len);

        for (let i = 0; i < len; i += 1) {
            let col: number;
            for (col = 0; col < maxColumn; col += 1) {
                isForbidden[col] = false;
            }
            for (let j = 0; j < i; j += 1) {
                if (this.overlap(events[i], events[j])) {
                    isForbidden[events[j].position] = true;
                }
            }
            for (col = 0; col < maxColumn; col += 1) {
                if (!isForbidden[col]) {
                    break;
                }
            }
            if (col < maxColumn) {
                events[i].position = col;
            } else {
                events[i].position = maxColumn++;
            }
        }
    }

    private static calculateWidth(orderedEvents: IDisplayEvent[]) {
        let cells = new Array(24);

        // sort by position in descending order, the right most columns should be calculated first
        orderedEvents.sort((eventA, eventB) => {
            return eventB.position - eventA.position;
        });
        for (let i = 0; i < 24; i += 1) {
            cells[i] = {
                calculated: false,
                events: []
            };
        }
        let len = orderedEvents.length;
        for (let i = 0; i < len; i += 1) {
            let event = orderedEvents[i];
            let index = event.startIndex;
            while (index < event.endIndex) {
                cells[index].events.push(event);
                index += 1;
            }
        }

        let i = 0;
        while (i < len) {
            let event = orderedEvents[i];
            if (!event.overlapNumber) {
                let overlapNumber = event.position + 1;
                event.overlapNumber = overlapNumber;
                let eventQueue = [event];
                while ((event = eventQueue.shift())) {
                    let index = event.startIndex;
                    while (index < event.endIndex) {
                        if (!cells[index].calculated) {
                            cells[index].calculated = true;
                            if (cells[index].events) {
                                let eventCountInCell = cells[index].events.length;
                                for (let j = 0; j < eventCountInCell; j += 1) {
                                    let currentEventInCell = cells[index].events[j];
                                    if (!currentEventInCell.overlapNumber) {
                                        currentEventInCell.overlapNumber = overlapNumber;
                                        eventQueue.push(currentEventInCell);
                                    }
                                }
                            }
                        }
                        index += 1;
                    }
                }
            }
            i += 1;
        }
    }

    eventSelected(event: IEvent) {
        this.onEventSelected.emit(event);
    }
}
