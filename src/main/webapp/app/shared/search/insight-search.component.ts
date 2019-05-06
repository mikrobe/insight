import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs/internal/operators';
import { SearchService } from './search.service';
import { GenericModel } from '../model/generic.model';
import { InsightSearchDirective } from './insight-search.directive';
import { Observable } from 'rxjs/index';

@Component({
    selector: 'ins-insight-search',
    templateUrl: './insight-search.component.html',
    styleUrls: ['insight-search.scss']
})
export class InsightSearchComponent implements OnInit, OnChanges {
    @Input()
    targetEntity: string[];
    @Input()
    textFields?: string[];
    @Input()
    imageField?: string;

    searchForm: FormControl = new FormControl('', [
        c => {
            if (!this.targetEntity || this.targetEntity.length === 0) {
                return { emptyArray: true };
            }
            return null;
        }
    ]);

    suggestions: GenericModel[];
    @ViewChild(InsightSearchDirective) suggestDirective: InsightSearchDirective;

    @Output()
    selectionEmitter: EventEmitter<any> = new EventEmitter();
    @Output()
    resultEmitter: EventEmitter<any> = new EventEmitter();

    @HostListener('document:click', ['$event'])
    onMouseGlobalClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        this.closeOnExternalAction(target);
    }

    @HostListener('document:wheel', ['$event'])
    onMouseGlobalWheel(event: WheelEvent) {
        this.closeOnExternalAction();
    }

    constructor(private _ss: SearchService) {}

    ngOnInit() {
        // Search AutoComplete
        this.getFormChangeObservable()
            .pipe(
                switchMap((value: string) => {
                    return this._ss.searchIndice(this.targetEntity[0], value);
                })
            )
            .subscribe((entities: GenericModel[]) => {
                this.suggestions = entities;
                this.displaySuggestions(!(!entities || entities.length === 0));
            });

        // Search
        this.getFormChangeObservable()
            .pipe(
                switchMap((value: string) => {
                    return this._ss.searchIndices(value, null, 20, null, this.targetEntity, null);
                })
            )
            .subscribe((entities: GenericModel[]) => {
                this.resultEmitter.next(entities);
            });
    }

    ngOnChanges(changes: any) {
        this.searchForm.updateValueAndValidity();
    }

    getFormChangeObservable(): Observable<any> {
        return this.searchForm.valueChanges.pipe(
            debounceTime(300),
            distinctUntilChanged(),
            filter(val => this.searchForm.valid)
        );
    }

    displaySuggestions(display: boolean) {
        if (this.suggestDirective) {
            if (display) {
                this.suggestDirective.suggestions = this.suggestions;
                this.suggestDirective.display();
            } else {
                this.suggestDirective.hide();
            }
        }
    }

    onNewSelection(data: GenericModel) {
        this.selectionEmitter.emit(data);
    }

    closeOnExternalAction(target?: HTMLElement) {
        if (this.suggestDirective) {
            if (target && this.suggestDirective.suggestComp && !this.suggestDirective.suggestComp.location.nativeElement.contains(target)) {
                this.suggestDirective.hide();
            } else if (!target) {
                this.suggestDirective.hide();
            }
        }
    }
}
