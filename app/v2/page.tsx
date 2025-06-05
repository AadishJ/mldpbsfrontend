/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  InfoIcon,
  AlertCircle,
  FileIcon,
  BarChart,
  TrendingUp,
  Users,
} from "lucide-react";

export default function Home() {
  const [numFiles, setNumFiles] = useState<number>(1);
  const [fileInputs, setFileInputs] = useState<Array<File | null>>([null]);
  const [fileNames, setFileNames] = useState<Array<string>>([]);
  const [entrySizes, setEntrySizes] = useState<Array<number>>([1]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsedResults, setParsedResults] = useState<any>(null);

  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    // Update file inputs when numFiles changes
    setFileInputs(Array(numFiles).fill(null));
    setFileNames(Array(numFiles).fill(""));
    setEntrySizes(Array(numFiles).fill(1));
    fileInputRefs.current = Array(numFiles).fill(null);
  }, [numFiles]);

  const handleNumFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (value > 0 && value <= 5) {
      setNumFiles(value);
    }
  };

  const handleFileChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (e.target.files && e.target.files[0]) {
      const newFileInputs = [...fileInputs];
      newFileInputs[index] = e.target.files[0];
      setFileInputs(newFileInputs);

      const newFileNames = [...fileNames];
      newFileNames[index] = e.target.files[0].name;
      setFileNames(newFileNames);
    }
  };

  const handleEntrySizeChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = parseInt(e.target.value) || 1;
    const newEntrySizes = [...entrySizes];
    newEntrySizes[index] = value;
    setEntrySizes(newEntrySizes);
  };

  const validateCSVFiles = async (
    files: Array<File | null>
  ): Promise<{ valid: boolean; datasets: any[] }> => {
    const datasets: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) {
        setError("Please upload all required CSV files.");
        return { valid: false, datasets: [] };
      }

      if (!file.name.toLowerCase().endsWith(".csv")) {
        setError(`File ${file.name} is not a CSV file.`);
        return { valid: false, datasets: [] };
      }

      // Parse the CSV file
      try {
        const result = await new Promise<Papa.ParseResult<any>>(
          (resolve, reject) => {
            Papa.parse(file, {
              header: true,
              skipEmptyLines: true,
              complete: resolve,
              error: reject,
            });
          }
        );

        const data = result.data;

        // Check if required columns exist
        if (
          !data[0] ||
          !("Day No." in data[0]) ||
          !("Number of entries" in data[0])
        ) {
          setError(
            `File ${file.name} is missing required columns 'Day No.' and/or 'Number of entries'.`
          );
          return { valid: false, datasets: [] };
        }

        // Add the dataset with entry size
        datasets.push({
          name: file.name.split(".").slice(0, -1).join("."),
          data: data,
          entry_size: entrySizes[i],
        });
      } catch (err) {
        setError(
          `Error parsing file ${file.name}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
        return { valid: false, datasets: [] };
      }
    }

    return { valid: true, datasets };
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    setApiResponse(null);
    setParsedResults(null);

    try {
      const validationResult = await validateCSVFiles(fileInputs);

      if (!validationResult.valid) {
        setIsLoading(false);
        return;
      }

      const apiUrl = "http://localhost:5000/predict";

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validationResult.datasets),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `API request failed with status ${
              response.status
            }: ${await response.text()}`
          );
        }

        const result = await response.json();
        setApiResponse(result);
        console.log(result);

        // Parse buddy allocation outputs for each batch
        if (result.batch_results) {
          const allParsedResults: any[] = [];

          result.batch_results.forEach((batch: any, batchIdx: number) => {
            if (batch.buddy_allocation_output) {
              try {
                const lines = batch.buddy_allocation_output.split("\n");
                const resultsTable = [];
                let headerLine = null;
                let inResults = false;

                for (const line of lines) {
                  if (line.trim() === "Results:") {
                    inResults = true;
                  } else if (inResults && line.includes("Block Size")) {
                    headerLine = line.trim().split("\t");
                  } else if (inResults && line.trim() && headerLine) {
                    const values = line.trim().split("\t");
                    if (values.length === headerLine.length) {
                      resultsTable.push(values);
                    }
                  }
                }

                if (headerLine && resultsTable.length > 0) {
                  allParsedResults.push({
                    batchNumber: batch.batch_number,
                    batchName: batch.batch_name,
                    headers: headerLine,
                    data: resultsTable,
                  });
                }
              } catch (err) {
                console.error(
                  `Error parsing batch ${batchIdx} allocation output:`,
                  err
                );
              }
            }
          });

          if (allParsedResults.length > 0) {
            setParsedResults(allParsedResults);
          }
        }
      } catch (err) {
        throw err;
      }
    } catch (err) {
      console.error("Error:", err);
      setError(
        err instanceof Error ? err.message : "An unknown error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight">
          ML Dynamic Prediction Based Buddy System - Batch Processing
        </h1>
        <p className="text-lg text-muted-foreground mt-4">
          Upload your CSV files to create batches with entries from each dataset
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload Data</CardTitle>
          <CardDescription>
            CSV files will be split into batches. Each batch contains entries
            from all uploaded datasets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="numFiles">
                How many CSV files would you like to upload?
              </Label>
              <Input
                id="numFiles"
                type="number"
                value={numFiles}
                onChange={handleNumFilesChange}
                min={1}
                max={5}
                className="w-24"
              />
              <p className="text-sm text-muted-foreground">
                Each CSV must contain &apos;Day No.&apos; and &apos;Number of
                entries&apos; columns (maximum 5 files)
              </p>
            </div>

            <div className="space-y-4">
              <Label>Upload your CSV files:</Label>
              {Array(numFiles)
                .fill(0)
                .map((_, index) => (
                  <div key={index} className="grid gap-2">
                    <div className="flex items-end gap-4">
                      <div className="flex-1">
                        <Label htmlFor={`file-${index}`} className="mb-1 block">
                          Dataset {index + 1}{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id={`file-${index}`}
                          type="file"
                          accept=".csv"
                          onChange={(e) =>
                            handleFileChange(
                              index,
                              e as React.ChangeEvent<HTMLInputElement>
                            )
                          }
                          ref={(el) => {
                            fileInputRefs.current[index] = el;
                          }}
                        />
                      </div>
                      <div className="w-32">
                        <Label htmlFor={`size-${index}`} className="mb-1 block">
                          Entry Size (KB)
                        </Label>
                        <Input
                          id={`size-${index}`}
                          type="number"
                          value={entrySizes[index]}
                          onChange={(e) => handleEntrySizeChange(index, e)}
                          min={1}
                          placeholder="1"
                        />
                      </div>
                      {fileNames[index] && (
                        <div className="flex items-center">
                          <FileIcon className="h-4 w-4 mr-2" />
                          <span className="text-sm">{fileNames[index]}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading
              ? "Processing Batches..."
              : "Process Data with Batch Analysis"}
          </Button>
        </CardFooter>
      </Card>

      {isLoading && (
        <div className="flex flex-col items-center justify-center p-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-center">Creating batches from your datasets...</p>
          <p className="text-center text-sm text-muted-foreground mt-2">
            Each batch contains datasets processed separately with individual ML
            models
          </p>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {apiResponse && (
        <div className="space-y-8">
          <Tabs defaultValue="overview">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Batch Overview</TabsTrigger>
              <TabsTrigger value="scenarios">Batch Details</TabsTrigger>
              <TabsTrigger value="performance">
                Allocation Performance
              </TabsTrigger>
              <TabsTrigger value="details">Raw Results</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <h2 className="text-2xl font-bold mt-4">
                Batch Processing Overview
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Original Datasets</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {apiResponse.datasets?.length || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      CSV files uploaded
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Batches Created</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {apiResponse.total_batches || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      batches processed
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      Total Dataset Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {apiResponse.batch_results?.reduce(
                        (total: number, batch: any) =>
                          total + (batch.dataset_results?.length || 0),
                        0
                      ) || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      individual ML results
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Buddy Allocations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {apiResponse.all_buddy_outputs?.length || 0}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      allocation results
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center">
                      <Users className="h-5 w-5 mr-2" />
                      Batch Summary
                    </CardTitle>
                    <CardDescription>
                      Overview of all processed batches
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {apiResponse.batch_results?.map(
                        (batch: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center p-3 bg-muted rounded"
                          >
                            <div>
                              <span className="font-medium">
                                {batch.batch_name}
                              </span>
                              <p className="text-sm text-muted-foreground">
                                {batch.datasets_in_batch} datasets •{" "}
                                {batch.total_row_count} total entries
                              </p>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium">
                                {batch.dataset_results?.length || 0} ML results
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Buddy allocation:{" "}
                                {batch.buddy_allocation_output
                                  ? "Generated"
                                  : "None"}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="scenarios" className="space-y-4">
              <h2 className="text-2xl font-bold mt-4">Batch Details</h2>
              <p className="text-muted-foreground mb-4">
                Detailed results for each batch, showing individual dataset
                processing within each batch
              </p>

              <div className="space-y-6">
                {apiResponse.batch_results?.map((batch: any, idx: number) => (
                  <Card key={idx}>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {batch.batch_name}
                      </CardTitle>
                      <CardDescription>
                        {batch.datasets_in_batch} datasets •{" "}
                        {batch.total_row_count} total entries
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <h4 className="font-medium">
                          Individual Dataset Results:
                        </h4>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Dataset Name</TableHead>
                                <TableHead>XGB Average</TableHead>
                                <TableHead>Entry Size (KB)</TableHead>
                                <TableHead>Row Count</TableHead>
                                <TableHead>Percentage</TableHead>
                                <TableHead>Weighted Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {batch.dataset_results?.map(
                                (dataset: any, datasetIdx: number) => (
                                  <TableRow key={datasetIdx}>
                                    <TableCell className="font-medium">
                                      {dataset.dataset_name}
                                    </TableCell>
                                    <TableCell>
                                      {dataset.xgb_average.toFixed(2)}
                                    </TableCell>
                                    <TableCell>{dataset.entry_size}</TableCell>
                                    <TableCell>{dataset.row_count}</TableCell>
                                    <TableCell>
                                      {dataset.percentage
                                        ? dataset.percentage.toFixed(2) + "%"
                                        : "N/A"}
                                    </TableCell>
                                    <TableCell>
                                      {dataset.weighted_value
                                        ? dataset.weighted_value.toFixed(2)
                                        : "N/A"}
                                    </TableCell>
                                  </TableRow>
                                )
                              )}
                            </TableBody>
                          </Table>
                        </div>

                        {batch.batch_percentages && (
                          <div className="mt-4">
                            <h5 className="font-medium mb-2">
                              Batch Percentages for Buddy Allocation:
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {batch.batch_percentages.map(
                                (percentage: number, pIdx: number) => (
                                  <span
                                    key={pIdx}
                                    className="px-2 py-1 bg-primary/10 rounded text-sm"
                                  >
                                    {percentage.toFixed(2)}%
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="performance">
              <h2 className="text-2xl font-bold mb-4">
                Memory Allocation Performance
              </h2>

              {parsedResults && parsedResults.length > 0 ? (
                <div className="space-y-6">
                  {parsedResults.map((result: any, idx: number) => (
                    <Card key={idx}>
                      <CardHeader>
                        <CardTitle className="text-lg">
                          {result.batchName} - Allocation Results
                        </CardTitle>
                        <CardDescription>
                          Buddy system allocation for batch {result.batchNumber}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                {result.headers.map(
                                  (header: string, headerIdx: number) => (
                                    <TableHead key={headerIdx}>
                                      {header}
                                    </TableHead>
                                  )
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.data.map(
                                (row: string[], rowIdx: number) => (
                                  <TableRow key={rowIdx}>
                                    {row.map(
                                      (cell: string, cellIdx: number) => (
                                        <TableCell key={cellIdx}>
                                          {cell}
                                        </TableCell>
                                      )
                                    )}
                                  </TableRow>
                                )
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <InfoIcon className="mx-auto h-8 w-8 mb-2" />
                  <p>No allocation performance data available</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="details">
              <h2 className="text-2xl font-bold mb-4">Raw Results</h2>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="batch-details">
                  <AccordionTrigger>Detailed Batch Processing</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-6">
                      {apiResponse.batch_results?.map(
                        (batch: any, idx: number) => (
                          <div key={idx} className="space-y-2">
                            <h3 className="text-lg font-semibold">
                              {batch.batch_name}
                            </h3>
                            <div className="ml-4 space-y-1">
                              <p>
                                <span className="font-medium">
                                  Batch Number:
                                </span>{" "}
                                {batch.batch_number}
                              </p>
                              <p>
                                <span className="font-medium">
                                  Total Row Count:
                                </span>{" "}
                                {batch.total_row_count}
                              </p>
                              <p>
                                <span className="font-medium">
                                  Datasets in Batch:
                                </span>{" "}
                                {batch.datasets_in_batch}
                              </p>
                              <p>
                                <span className="font-medium">
                                  Has Buddy Allocation:
                                </span>{" "}
                                {batch.buddy_allocation_output ? "Yes" : "No"}
                              </p>
                            </div>

                            <div className="ml-4 mt-4">
                              <h4 className="font-medium">Dataset Results:</h4>
                              {batch.dataset_results?.map(
                                (dataset: any, datasetIdx: number) => (
                                  <div
                                    key={datasetIdx}
                                    className="ml-4 mt-2 p-2 border rounded"
                                  >
                                    <p className="font-medium">
                                      {dataset.dataset_name}
                                    </p>
                                    <p className="text-sm">
                                      XGBoost Average:{" "}
                                      {dataset.xgb_average.toFixed(4)}
                                    </p>
                                    <p className="text-sm">
                                      Entry Size: {dataset.entry_size} KB
                                    </p>
                                    <p className="text-sm">
                                      Row Count: {dataset.row_count}
                                    </p>
                                    <p className="text-sm">
                                      Percentage:{" "}
                                      {dataset.percentage
                                        ? dataset.percentage.toFixed(2) + "%"
                                        : "N/A"}
                                    </p>
                                    <p className="text-sm">
                                      Weighted Value:{" "}
                                      {dataset.weighted_value
                                        ? dataset.weighted_value.toFixed(2)
                                        : "N/A"}
                                    </p>

                                    {dataset.results &&
                                      Object.entries(dataset.results).map(
                                        ([modelName, modelResults]: [
                                          string,
                                          any
                                        ]) => (
                                          <div
                                            key={modelName}
                                            className="ml-2 mt-1"
                                          >
                                            <p className="text-xs font-medium">
                                              {modelName}:
                                            </p>
                                            <p className="text-xs">
                                              MSE: {modelResults.mse.toFixed(4)}
                                            </p>
                                            {modelResults.predictions && (
                                              <div className="flex items-center gap-2 mt-1">
                                                <BarChart className="h-3 w-3" />
                                                <p className="text-xs text-muted-foreground">
                                                  Predictions:{" "}
                                                  {modelResults.predictions
                                                    .map((val: number) =>
                                                      val.toFixed(1)
                                                    )
                                                    .join(", ")}
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        )
                                      )}
                                  </div>
                                )
                              )}
                            </div>
                            <Separator className="my-4" />
                          </div>
                        )
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="buddy-allocation">
                  <AccordionTrigger>Buddy Allocation Results</AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">
                        All Buddy Allocation Results
                      </h3>
                      {apiResponse.all_buddy_outputs?.map(
                        (buddyOutput: any, idx: number) => (
                          <div key={idx} className="p-4 border rounded">
                            <h4 className="font-medium mb-2">
                              {buddyOutput.batch_name}
                            </h4>
                            <p className="text-sm text-muted-foreground mb-2">
                              Batch Number: {buddyOutput.batch_number}
                            </p>
                            <div className="mb-2">
                              <span className="text-sm font-medium">
                                Percentages:{" "}
                              </span>
                              {buddyOutput.percentages?.map(
                                (pct: number, pIdx: number) => (
                                  <span
                                    key={pIdx}
                                    className="inline-block px-2 py-1 bg-muted rounded text-xs mr-1"
                                  >
                                    {pct.toFixed(2)}%
                                  </span>
                                )
                              )}
                            </div>
                            {buddyOutput.buddy_output && (
                              <div className="bg-muted p-2 rounded text-xs font-mono">
                                <pre>{buddyOutput.buddy_output}</pre>
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="raw-response">
                  <AccordionTrigger>Raw API Response</AccordionTrigger>
                  <AccordionContent>
                    <div className="bg-muted p-4 rounded-md overflow-x-auto">
                      <pre className="text-xs font-mono">
                        {JSON.stringify(apiResponse, null, 2)}
                      </pre>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
