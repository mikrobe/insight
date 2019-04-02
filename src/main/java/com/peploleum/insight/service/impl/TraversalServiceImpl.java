package com.peploleum.insight.service.impl;

import com.microsoft.spring.data.gremlin.common.GremlinFactory;
import com.microsoft.spring.data.gremlin.conversion.MappingGremlinConverter;
import com.microsoft.spring.data.gremlin.conversion.script.GremlinScriptLiteralVertex;
import com.microsoft.spring.data.gremlin.mapping.GremlinMappingContext;
import com.microsoft.spring.data.gremlin.query.GremlinTemplate;
import com.peploleum.insight.service.TraversalService;
import com.peploleum.insight.service.dto.NodeDTO;
import org.apache.tinkerpop.gremlin.driver.Result;
import org.apache.tinkerpop.gremlin.driver.ResultSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.domain.EntityScanner;
import org.springframework.context.ApplicationContext;
import org.springframework.data.annotation.Persistent;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * Created by GFOLGOAS on 01/04/2019.
 */
@Service
public class TraversalServiceImpl implements TraversalService {
    private final Logger log = LoggerFactory.getLogger(TraversalServiceImpl.class);

    private ApplicationContext context;
    private GremlinFactory gremlinFactory;
    private GremlinTemplate template;

    public TraversalServiceImpl(final ApplicationContext context, final GremlinFactory gremlinFactory) {
        this.context = context;
        this.gremlinFactory = gremlinFactory;
        try {
            final GremlinMappingContext mappingContext = new GremlinMappingContext();
            mappingContext.setInitialEntitySet(new EntityScanner(this.context).scan(Persistent.class));
            final MappingGremlinConverter converter = new MappingGremlinConverter(mappingContext);
            this.template = new GremlinTemplate(this.gremlinFactory, converter);
        } catch (ClassNotFoundException e) {
            this.log.error("Erreur lors de l'instanciation du TraversalServiceImpl", e);
        }
    }

    @Override
    public List<NodeDTO> getNeighbors(NodeDTO node) {
        final List<NodeDTO> nodeList = new ArrayList<>();
        final String id = node.getId();
        this.log.info("searching by GraphId: " + id + " and traversing outgoing edges to get neighbors");
        final String neighborSuffix = ".outE().limit(50).inV().toList()";
        final ResultSet neighborResultSet = this.template.getGremlinClient().submit("g.V(" + id + ")" + neighborSuffix);
        this.log.info("Parsing neighbors");
        neighborResultSet.stream().forEach(result -> {
            this.log.info("------------");
            final LinkedHashMap resultObject = (LinkedHashMap) result.getObject();
            resultObject.keySet().stream().forEach((key -> {
                this.log.info(key + " - " + resultObject.get(key).toString());
            }));
            final NodeDTO neighbor = new NodeDTO();
            final String type = resultObject.get("label").toString();
            final String graphId = resultObject.get("id").toString();
            neighbor.setType(type);
            final String idMongo = smartOpenProperties(resultObject, "idMongo");
            neighbor.setId(graphId);
            String searchKey = findSearchKey(type);
            if (searchKey != null) {
                neighbor.setIdMongo(idMongo);
                final String label = smartOpenProperties(resultObject, searchKey);
                if (label != null) {
                    neighbor.setLabel(label);
                    nodeList.add(neighbor);
                    this.log.info("adding node: " + neighbor.toString());
                }
            }
        });
        return nodeList;
    }

    @Override
    public NodeDTO getByMongoId(String mongoId) {
        this.log.info("Searching Node with idMongo property: " + mongoId);
        final String mongoIdQuery = GremlinScriptLiteralVertex.generateHas("idMongo", mongoId);
        final String gremlinQuery = "g.V()." + mongoIdQuery + ".next()";
        final NodeDTO foundNode = internalGetNode(gremlinQuery);
        if (foundNode == null) return null;
        return foundNode;
    }

    @Override
    public NodeDTO getByJanusId(String id) {
        this.log.info("Searching Node with janusId property: " + id);
        final String gremlinQuery = "g.V(" + id + ")";
        final NodeDTO foundNode = internalGetNode(gremlinQuery);
        if (foundNode == null) return null;
        return foundNode;
    }

    @Override
    public List<NodeDTO> getNeighborsMock(String id) {
        final List<NodeDTO> neighbors = generateNeighbors();
        return neighbors;
    }

    private NodeDTO internalGetNode(String gremlinQuery) {
        this.log.info("GremlinQuery: " + gremlinQuery);
        final ResultSet resultSet = this.template.getGremlinClient().submit(gremlinQuery);
        this.log.info("Parsing first result");
        final NodeDTO foundNode = new NodeDTO();
        final Result result = resultSet.one();
        if (result == null) {
            this.log.info("No result");
            return null;
        }
        this.log.info("Found result");
        final LinkedHashMap resultObject = (LinkedHashMap) result.getObject();
        final String type = resultObject.get("label").toString();
        final String id = resultObject.get("id").toString();
        foundNode.setId(id);
        foundNode.setType(type);
        foundNode.setIdMongo(smartOpenProperties(resultObject, "idMongo"));
        final String searchKey = findSearchKey(type);
        this.log.info("Searching key: " + searchKey);
        if (searchKey != null) {
            final String label = smartOpenProperties(resultObject, searchKey);
            if (label != null) {
                foundNode.setLabel(label);
                this.log.info("found node: " + foundNode.toString());
            }
        }
        return foundNode;
    }

    private String findSearchKey(String type) {
        String searchKey = null;
        switch (type) {
            case "Biographics":
                searchKey = "biographicsName";
                break;
            case "Event":
                searchKey = "eventName";
                break;
            case "Equipment":
                searchKey = "equipmentName";
                break;
            case "Location":
                searchKey = "locationName";
                break;
            case "RawData":
                searchKey = "rawDataName";
                break;
            case "Organisation":
                searchKey = "organisationName";
                break;
            default:
                break;
        }
        return searchKey;
    }

    private String smartOpenProperties(LinkedHashMap object, String key) {
        final LinkedHashMap properties = (LinkedHashMap) object.get("properties");
        if (properties != null) {
            final Object idMongo = properties.get(key);
            if (idMongo != null) {
                final LinkedHashMap propertyList = (LinkedHashMap) ((ArrayList) idMongo).get(0);
                if (propertyList != null) {
                    final String value = propertyList.get("value").toString();
                    return value;
                }
            }
        }
        return null;
    }

    public static List<NodeDTO> generateNeighbors() {
        final List<NodeDTO> neighbors = new ArrayList<>();
        final NodeDTO bioNode = new NodeDTO();
        final String bioMongoId = UUID.randomUUID().toString();
        bioNode.setId(bioMongoId);
        bioNode.setLabel("Paul");
        bioNode.setType("Biographics");
        neighbors.add(bioNode);
        NodeDTO eventNode = new NodeDTO();
        final String eventMongoId = UUID.randomUUID().toString();
        eventNode.setId(eventMongoId);
        eventNode.setLabel("Bombing");
        eventNode.setType("Event");
        neighbors.add(eventNode);
        final String eqMongoId = UUID.randomUUID().toString();
        final NodeDTO eqNode = new NodeDTO();
        eqNode.setId(eqMongoId);
        eqNode.setLabel("Gun");
        eqNode.setType("Equipment");
        neighbors.add(eqNode);
        final NodeDTO rawDataNode = new NodeDTO();
        final String rawDataMongoId = UUID.randomUUID().toString();
        rawDataNode.setId(rawDataMongoId);
        rawDataNode.setLabel("Tweet");
        rawDataNode.setType("RawData");
        neighbors.add(rawDataNode);
        return neighbors;
    }
}