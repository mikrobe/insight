package com.peploleum.insight.web.rest;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Optional;

import com.codahale.metrics.annotation.Timed;
import com.peploleum.insight.service.ReportQueryService;
import com.peploleum.insight.service.ReportService;
import com.peploleum.insight.service.dto.ReportCriteria;
import com.peploleum.insight.service.dto.ReportDTO;
import com.peploleum.insight.web.rest.errors.BadRequestAlertException;
import com.peploleum.insight.web.rest.util.HeaderUtil;
import com.peploleum.insight.web.rest.util.PaginationUtil;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.github.jhipster.web.util.ResponseUtil;

/**
 * REST controller for managing Report.
 */
@RestController
@RequestMapping("/api")
public class ReportResource {

    private final Logger log = LoggerFactory.getLogger(ReportResource.class);

    private static final String ENTITY_NAME = "report";

    private final ReportService reportService;

    private final ReportQueryService reportQueryService;

    public ReportResource(ReportService reportService, ReportQueryService reportQueryService) {
        this.reportService = reportService;
        this.reportQueryService = reportQueryService;
    }

    /**
     * POST  /reports : Create a new report.
     *
     * @param reportDTO the reportDTO to create
     * @return the ResponseEntity with status 201 (Created) and with body the new reportDTO, or with status 400 (Bad Request) if the report has already an ID
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PostMapping("/reports")
    @Timed
    public ResponseEntity<ReportDTO> createReport(@RequestBody ReportDTO reportDTO) throws URISyntaxException {
        log.debug("REST request to save Report : {}", reportDTO);
        if (reportDTO.getId() != null) {
            throw new BadRequestAlertException("A new report cannot already have an ID", ENTITY_NAME, "idexists");
        }
        ReportDTO result = reportService.save(reportDTO);
        return ResponseEntity.created(new URI("/api/reports/" + result.getId()))
            .headers(HeaderUtil.createEntityCreationAlert(ENTITY_NAME, result.getId().toString()))
            .body(result);
    }

    /**
     * PUT  /reports : Updates an existing report.
     *
     * @param reportDTO the reportDTO to update
     * @return the ResponseEntity with status 200 (OK) and with body the updated reportDTO,
     * or with status 400 (Bad Request) if the reportDTO is not valid,
     * or with status 500 (Internal Server Error) if the reportDTO couldn't be updated
     * @throws URISyntaxException if the Location URI syntax is incorrect
     */
    @PutMapping("/reports")
    @Timed
    public ResponseEntity<ReportDTO> updateReport(@RequestBody ReportDTO reportDTO) throws URISyntaxException {
        log.debug("REST request to update Report : {}", reportDTO);
        if (reportDTO.getId() == null) {
            throw new BadRequestAlertException("Invalid id", ENTITY_NAME, "idnull");
        }
        ReportDTO result = reportService.save(reportDTO);
        return ResponseEntity.ok()
            .headers(HeaderUtil.createEntityUpdateAlert(ENTITY_NAME, reportDTO.getId().toString()))
            .body(result);
    }

    /**
     * GET  /reports : get all the reports.
     *
     * @param pageable the pagination information
     * @param criteria the criterias which the requested entities should match
     * @return the ResponseEntity with status 200 (OK) and the list of reports in body
     */
    @GetMapping("/reports")
    @Timed
    public ResponseEntity<List<ReportDTO>> getAllReports(ReportCriteria criteria, Pageable pageable) {
        log.debug("REST request to get Reports by criteria: {}", criteria);
        Page<ReportDTO> page = reportQueryService.findByCriteria(criteria, pageable);
        HttpHeaders headers = PaginationUtil.generatePaginationHttpHeaders(page, "/api/reports");
        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }

    /**
     * GET  /reports/:id : get the "id" report.
     *
     * @param id the id of the reportDTO to retrieve
     * @return the ResponseEntity with status 200 (OK) and with body the reportDTO, or with status 404 (Not Found)
     */
    @GetMapping("/reports/{id}")
    @Timed
    public ResponseEntity<ReportDTO> getReport(@PathVariable Long id) {
        log.debug("REST request to get Report : {}", id);
        Optional<ReportDTO> reportDTO = reportService.findOne(id);
        return ResponseUtil.wrapOrNotFound(reportDTO);
    }

    /**
     * DELETE  /reports/:id : delete the "id" report.
     *
     * @param id the id of the reportDTO to delete
     * @return the ResponseEntity with status 200 (OK)
     */
    @DeleteMapping("/reports/{id}")
    @Timed
    public ResponseEntity<Void> deleteReport(@PathVariable Long id) {
        log.debug("REST request to delete Report : {}", id);
        reportService.delete(id);
        return ResponseEntity.ok().headers(HeaderUtil.createEntityDeletionAlert(ENTITY_NAME, id.toString())).build();
    }

    /**
     * SEARCH  /_search/reports?query=:query : search for the report corresponding
     * to the query.
     *
     * @param query the query of the report search
     * @param pageable the pagination information
     * @return the result of the search
     */
    @GetMapping("/_search/reports")
    @Timed
    public ResponseEntity<List<ReportDTO>> searchReports(@RequestParam String query, Pageable pageable) {
        log.debug("REST request to search for a page of Reports for query {}", query);
        Page<ReportDTO> page = reportService.search(query, pageable);
        HttpHeaders headers = PaginationUtil.generateSearchPaginationHttpHeaders(query, page, "/api/_search/reports");
        return new ResponseEntity<>(page.getContent(), headers, HttpStatus.OK);
    }

}