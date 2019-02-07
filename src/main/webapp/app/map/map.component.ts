import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { MapService } from './map.service';
import Map from 'ol/map';
import View from 'ol/view';
import VectorSource from 'ol/source/vector';
import VectorLayer from 'ol/layer/vector';
import TileLayer from 'ol/layer/tile';
import OSM from 'ol/source/osm';
import BingMaps from 'ol/source/bingmaps';
import control from 'ol/control';
import Feature from 'ol/feature';
import SelectInteration from 'ol/interaction/select';
import DrawInteraction from 'ol/interaction/draw';
import SnapInteraction from 'ol/interaction/snap';
import ModifyInteraction from 'ol/interaction/modify';
import DragAndDropInteraction from 'ol/interaction/draganddrop';
import KML from 'ol/format/kml';

import Stroke from 'ol/style/stroke';
import Circle from 'ol/style/circle';
import Icon from 'ol/style/icon';
import Style from 'ol/style/style';
import Fill from 'ol/style/fill';
import Text from 'ol/style/text';
import { FigureStyle, MapLayer, MapState } from '../shared/util/map-utils';
import { Subscription } from 'rxjs/index';
import { pairwise, startWith } from 'rxjs/internal/operators';
import { UUID } from '../shared/util/insight-util';

@Component({
    selector: 'jhi-map',
    templateUrl: './map.component.html',
    styles: [':host { flex-grow: 1 }']
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
    rawDataSource: VectorSource = new VectorSource();
    featureLayer: VectorLayer;
    _map: Map;

    selectInteraction: SelectInteration;
    drawInteraction: DrawInteraction;
    snapInteraction: SnapInteraction;
    modifyInteraction: ModifyInteraction;
    dragAndDropInteraction: DragAndDropInteraction;

    private circleImage = new Circle({
        radius: 13,
        fill: new Fill({
            color: 'rgba(203, 65, 42, 0.1)'
        }),
        stroke: new Stroke({ color: '#ffc600', width: 3 })
    });
    private selectedCircleImage = new Circle({
        radius: 13,
        fill: new Fill({
            color: 'rgba(203, 65, 42, 0.1)'
        }),
        stroke: new Stroke({ color: '#cb412a', width: 3 })
    });

    computedHeight = 0;

    featureSourceSubs: Subscription;
    featureSelectorSubs: Subscription;
    layerSubs: Subscription;

    @HostListener('window:resize')
    onResize() {
        this.internalOnResize();
    }

    constructor(private er: ElementRef, private cdr: ChangeDetectorRef, private ms: MapService) {
        this.featureLayer = new VectorLayer({
            source: this.rawDataSource,
            style: (feature: Feature) => this.styleFunction(feature, false),
            zIndex: 1
        });

        this.selectInteraction = new SelectInteration({
            style: (feature: Feature) => this.styleFunction(feature, true),
            multi: true
        });
        this.dragAndDropInteraction = new DragAndDropInteraction({
            formatConstructors: [KML],
            projection: 'EPSG:3857'
        });
    }

    internalOnResize() {
        console.log('RESIZE');
        console.log(this.er.nativeElement.offsetHeight);
        this.computedHeight = this.er.nativeElement.offsetHeight;
        this.cdr.detectChanges();
    }

    ngOnInit() {}

    ngAfterViewInit(): void {
        this.initMap();
        this.initMapLayerListener();
        this.featureSourceSubs = this.ms.featureSource.subscribe((features: Feature[]) => {
            this.rawDataSource.addFeatures(features);
        });
        this.featureSelectorSubs = this.ms.outsideFeatureSelector.subscribe((ids: string[]) => {
            if (ids && ids.length) {
                this.selectAndGoTo(ids[0]);
            }
        });
        this.initDessinTools();
    }

    ngOnDestroy() {
        if (this.featureSourceSubs) {
            this.featureSourceSubs.unsubscribe();
        }
        if (this.featureSelectorSubs) {
            this.featureSelectorSubs.unsubscribe();
        }
        if (this.layerSubs) {
            this.layerSubs.unsubscribe();
        }
    }

    private initMap() {
        // const readFeatures = new GeoJSON().readFeatures(GEO_JSON_OBJECT);
        this._map = new Map({
            layers: [this.featureLayer],
            target: 'map',
            controls: control.defaults({
                attributionOptions: {
                    collapsible: false
                }
            }),
            view: new View({
                center: [0, 0],
                zoom: 2,
                minZoom: 1,
                maxZoom: 20
            })
        });
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        });
        this._map.addInteraction(this.selectInteraction);
        this._map.addInteraction(this.dragAndDropInteraction);

        this.dragAndDropInteraction.on('addfeatures', (event: DragAndDropInteraction.Event) => {
            const newMapLayer: MapLayer = new MapLayer(UUID(), 'KML', 'KML', true);
            newMapLayer.layerStatus = 'UPDATE'; // Pour éviter de l'ajouter une deuxième fois
            const vectorSource = new VectorSource({
                features: event.features
            });
            const newVectorLayer: VectorLayer = new VectorLayer({
                source: vectorSource,
                zIndex: 1
            });
            vectorSource.set('id', newMapLayer.layerId);
            newVectorLayer.set('id', newMapLayer.layerId);
            this._map.addLayer(newVectorLayer);
            this._map.getView().fit(vectorSource.getExtent());
            this.ms.mapLayers.next(this.ms.mapLayers.getValue().concat(newMapLayer));
        });
    }

    private initMapLayerListener() {
        this.layerSubs = this.ms.mapLayers.subscribe((update: MapLayer[]) => {
            if (this._map.getLayers().getLength() === 1) {
                // Si aucun layer présent dans la map, alors tous les layers sont status NEW
                update.forEach(layer => (layer.layerStatus = 'NEW'));
            }
            this.updateLayers(update);
        });
    }

    updateLayers(layers: MapLayer[]) {
        const layerIds: string[] = layers.map(layer => layer.layerId);
        const updateLayers = {}; // Transformation en object pour permettre la recherche par key/value
        layers.filter(layer => layer.layerStatus === 'UPDATE').forEach(layer => (updateLayers[layer.layerId] = layer));

        // UPDATE
        this._map.getLayers().forEach(layer => {
            const layerId: string = layer.get('id');
            if (updateLayers[layerId]) {
                const mapLayer: MapLayer = updateLayers[layerId];
                layer.setVisible(mapLayer.visible);

                // Si changement de sélection du layer de dessin
                if (this.getMapStates().DESSIN_ENABLED && mapLayer.layerType === 'DESSIN' && mapLayer.selected) {
                    if (this.drawInteraction.get('id') !== mapLayer.layerId) {
                        this.removeDrawInteraction();
                        this.addDrawInteraction();
                    }
                }
            }
        });

        // DELETE
        const deleteLayer = [];
        this._map.getLayers().forEach(layer => {
            if (layer.get('id') && layerIds.indexOf(layer.get('id')) === -1) {
                deleteLayer.push(layer);
            }
        });
        deleteLayer.forEach(layer => this._map.removeLayer(layer));

        // NEW
        const addLayers: MapLayer[] = layers.filter(layer => layer.layerStatus === 'NEW');
        addLayers.forEach(newLayer => {
            let newItem = null;
            if (newLayer.layerType === 'DESSIN') {
                const vectorSource = new VectorSource();
                vectorSource.set('id', newLayer.layerId);
                newItem = new VectorLayer({
                    source: vectorSource,
                    style: (feature: Feature) => this.getDessinStyle(),
                    zIndex: 1
                });
            } else if (newLayer.layerType === 'SOURCE') {
                if (newLayer.layerName === 'OSM') {
                    newItem = new TileLayer({
                        source: new OSM(),
                        zIndex: 0
                    });
                } else if (newLayer.layerName === 'BingMaps') {
                    // key associée à un compte microsoft perso
                    newItem = new TileLayer({
                        source: new BingMaps({
                            key: 'AhZ8yD8nLNihhvRg-tAzuo49c2tqIkKLDKyYqCkMoQmniNx0ruDCDmq0kbR--sGl',
                            imagerySet: 'Aerial',
                            maxZoom: 19
                        }),
                        zIndex: 0
                    });
                }
            }
            if (newItem !== null) {
                newItem.setVisible(newLayer.visible);
                newItem.set('id', newLayer.layerId);
                this._map.addLayer(newItem);
            }
        });
    }

    private initDessinTools() {
        // pairwise permet de recevoir les items sous la forme [oldValue, newValue],
        // startWith initialise la premiere value
        this.ms.dessinStates
            .pipe(
                startWith(null),
                pairwise()
            )
            .subscribe((values: FigureStyle[]) => {
                if (!this.getMapStates().DESSIN_ENABLED) {
                    return;
                }
                if (values[0] == null || values[0].form !== values[1].form) {
                    this.removeDrawInteraction();
                    this.addDrawInteraction();
                }
            });
    }

    getSelectedDessinSource(): VectorSource {
        const selectedLayer: MapLayer = this.ms.mapLayers.getValue().find(layer => layer.layerType === 'DESSIN' && layer.selected);
        if (selectedLayer == null || typeof selectedLayer === 'undefined') {
            return null;
        }
        for (const layer of this._map.getLayers().getArray()) {
            if (layer instanceof VectorLayer && layer.get('id') === selectedLayer.layerId) {
                return (<VectorLayer>layer).getSource();
            }
        }
    }

    addDrawInteraction() {
        const currentDessinSrc: VectorSource = this.getSelectedDessinSource();
        if (currentDessinSrc == null) {
            return;
        }
        this.drawInteraction = new DrawInteraction({
            source: currentDessinSrc,
            type: this.getDessinStates().form === 'Rectangle' ? 'Circle' : this.getDessinStates().form,
            geometryFunction: this.getDessinStates().form === 'Rectangle' ? DrawInteraction.createBox() : null
        });
        this.drawInteraction.set('id', currentDessinSrc.get('id'));
        this._map.addInteraction(this.drawInteraction);
        this.snapInteraction = new SnapInteraction({
            source: currentDessinSrc
        });
        this._map.addInteraction(this.snapInteraction);
        this.modifyInteraction = new ModifyInteraction({
            source: currentDessinSrc
        });
        this._map.addInteraction(this.modifyInteraction);
    }

    removeDrawInteraction() {
        this._map.removeInteraction(this.drawInteraction);
        this._map.removeInteraction(this.snapInteraction);
        this._map.removeInteraction(this.modifyInteraction);
    }

    getDessinStates(): FigureStyle {
        return this.ms.dessinStates.getValue();
    }

    getDessinStyle(): Style {
        return new Style({
            stroke: new Stroke({
                color: this.getDessinStates().strokeColor,
                lineDash: [this.getDessinStates().type],
                width: this.getDessinStates().size
            }),
            fill: new Fill({
                color: this.getDessinStates().fillColor
            }),
            image: new Circle({
                radius: 10,
                fill: new Fill({
                    color: this.getDessinStates().fillColor
                }),
                stroke: new Stroke({
                    color: this.getDessinStates().strokeColor,
                    lineDash: [this.getDessinStates().type],
                    width: this.getDessinStates().size
                })
            })
        });
    }

    selectAndGoTo(objectId: string) {
        this.selectInteraction.getFeatures().clear();
        const selectedFeat: Feature = this.rawDataSource.getFeatureById(objectId);
        if (selectedFeat) {
            this.selectInteraction.getFeatures().push(selectedFeat);
            this._map.getView().fit(selectedFeat.getGeometry().getExtent(), { duration: 1500 });
        }
    }

    getMapStates(): MapState {
        return this.ms.mapStates.getValue();
    }

    styleFunction(feature: Feature, isSelected: boolean) {
        const mainStyle: Style = this.getStyle(feature.getGeometry().getType());
        if (isSelected) {
            mainStyle.setImage(this.selectedCircleImage);
        }
        if (feature.getGeometry().getType() === 'Point') {
            const iconStyle: Style = this.getIconStyle(feature);
            const zoom = this._map.getView().getZoom();
            if (zoom > 5 && this.getMapStates().DISPLAY_LABEL && feature.get('label')) {
                mainStyle.getText().setText(feature.get('label'));
            } else {
                mainStyle.getText().setText('');
            }
            return [iconStyle, mainStyle];
        }
        return [mainStyle];
    }

    getIconStyle(feature: Feature): Style {
        const objectType = feature.get('objectType');
        const src: string = MapService.getImageIconUrl(objectType);
        return new Style({
            image: new Icon({
                anchor: [0.5, 0.5],
                scale: 0.05,
                src: `${src}`
            })
        });
    }

    getStyle(geometryType: string): Style {
        switch (geometryType) {
            case 'Point':
                return new Style({
                    image: this.circleImage,
                    text: new Text({
                        font: 'bold 11px "Open Sans", "Arial Unicode MS", "sans-serif"',
                        placement: 'point',
                        textBaseline: 'top',
                        offsetY: 10,
                        fill: new Fill({
                            color: 'black'
                        })
                    })
                });
                break;
            case 'LineString':
                return new Style({
                    stroke: new Stroke({
                        color: 'green',
                        width: 1
                    })
                });
                break;
            case 'MultiLineString':
                return new Style({
                    stroke: new Stroke({
                        color: 'green',
                        width: 1
                    })
                });
                break;
            case 'MultiPoint':
                return new Style({
                    image: this.circleImage
                });
                break;
            case 'MultiPolygon':
                return new Style({
                    stroke: new Stroke({
                        color: 'yellow',
                        width: 1
                    }),
                    fill: new Fill({
                        color: 'rgba(255, 255, 0, 0.1)'
                    })
                });
                break;
            case 'Polygon':
                return new Style({
                    stroke: new Stroke({
                        color: 'blue',
                        lineDash: [4],
                        width: 3
                    }),
                    fill: new Fill({
                        color: 'rgba(0, 0, 255, 0.1)'
                    })
                });
                break;
            case 'GeometryCollection':
                return new Style({
                    stroke: new Stroke({
                        color: 'magenta',
                        width: 2
                    }),
                    fill: new Fill({
                        color: 'magenta'
                    }),
                    image: new Circle({
                        radius: 10,
                        fill: null,
                        stroke: new Stroke({
                            color: 'magenta'
                        })
                    })
                });
                break;
            default:
                return new Style({
                    stroke: new Stroke({
                        color: 'red',
                        width: 2
                    }),
                    fill: new Fill({
                        color: 'rgba(255,0,0,0.2)'
                    })
                });
                break;
        }
    }

    onActionReceived(action: string) {
        const mapState = this.getMapStates();
        switch (action) {
            case 'F_ALL_DATA':
                if (mapState.FILTER_TYPE !== 'all') {
                    mapState.FILTER_TYPE = 'all';
                    this.onFilterChanged();
                }
                break;
            case 'F_LOCATIONS_ONLY':
                if (mapState.FILTER_TYPE !== 'locations') {
                    mapState.FILTER_TYPE = 'locations';
                    this.onFilterChanged();
                }
                break;
            case 'F_IMAGES_ONLY':
                if (mapState.FILTER_TYPE !== 'images') {
                    mapState.FILTER_TYPE = 'images';
                    this.onFilterChanged();
                }
                break;
            case 'F_NO_FILTER':
                if (mapState.FILTER_TYPE) {
                    mapState.FILTER_TYPE = null;
                    this.onFilterChanged();
                }
                break;
            case 'DESSIN_ENABLED':
                mapState.DESSIN_ENABLED = !mapState.DESSIN_ENABLED;
                if (!mapState.DESSIN_ENABLED && this.drawInteraction) {
                    this.removeDrawInteraction();
                    this._map.addInteraction(this.selectInteraction);
                } else if (mapState.DESSIN_ENABLED) {
                    this._map.removeInteraction(this.selectInteraction);
                    this.addDrawInteraction();
                }
                break;
            default:
                break;
        }
        this.ms.mapStates.next(mapState);
    }

    onFilterChanged() {
        this.rawDataSource.clear();
    }
}
