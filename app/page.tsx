/* eslint-disable @typescript-eslint/no-unused-vars */
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
import { InfoIcon, AlertCircle, FileIcon } from "lucide-react";

export default function Home() {
  const [numFiles, setNumFiles] = useState<number>(1);
  const [fileInputs, setFileInputs] = useState<Array<File | null>>([null]);
  const [fileNames, setFileNames] = useState<Array<string>>([]);
  const [entrySizes, setEntrySizes] = useState<Array<number>>([1]); // New state for entry sizes
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsedResults, setParsedResults] = useState<any>(null);

  const fileInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    // Update file inputs when numFiles changes
    setFileInputs(Array(numFiles).fill(null));
    setFileNames(Array(numFiles).fill(""));
    setEntrySizes(Array(numFiles).fill(1)); // Initialize entry sizes
    fileInputRefs.current = Array(numFiles).fill(null);
  }, [numFiles]);

  const handleNumFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (value > 0 && value <= 10) {
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
          name: file.name.split(".").slice(0, -1).join("."), // Remove .csv extension
          data: data,
          entry_size: entrySizes[i], // Include entry size
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

      // Show a message about longer processing time
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        "https://mldpbs-api.onrender.com/predict";

      // Use AbortController to implement timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800000); // 3 minute timeout

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

        // Parse the buddy allocation output for display
        if (result.buddy_allocation_output) {
          try {
            const lines = result.buddy_allocation_output.split("\n");
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
              setParsedResults({
                headers: headerLine,
                data: resultsTable,
              });
            }
          } catch (err) {
            console.error("Error parsing buddy allocation output:", err);
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
          ML Dynamic Prediction Based Buddy System
        </h1>
        <p className="text-lg text-muted-foreground mt-4">
          Upload your CSV files with resource usage data to predict optimal
          memory allocation
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload Data</CardTitle>
          <CardDescription>
            Please provide CSV files containing resource usage data and specify
            the size of each entry
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
                max={10}
                className="w-24"
              />
              <p className="text-sm text-muted-foreground">
                Each CSV must contain &apos;Day No.&apos; and &apos;Number of
                entries&apos; columns
              </p>
            </div>

            <div className="space-y-4">
              <Label>Upload your CSV files:</Label>
              {Array(numFiles)
                .fill(0)
                .map((_, index) => (
                  <div key={index} className="grid gap-4">
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
                          Entry Size (KB){" "}
                          <span className="text-destructive">*</span>
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
                          <div className="text-sm">
                            <div className="flex items-center mb-1">
                              <FileIcon className="h-4 w-4 mr-2" />
                              <span className="font-medium">
                                {fileNames[index]}
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              {entrySizes[index]} KB per entry
                            </div>
                          </div>
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
            {isLoading ? "Processing..." : "Process Data"}
          </Button>
        </CardFooter>
      </Card>

      {isLoading && (
        <div className="flex flex-col items-center justify-center p-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-center">Processing your data...</p>
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
          <Tabs defaultValue="predictions">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="predictions">Prediction Results</TabsTrigger>
              <TabsTrigger value="performance">
                Allocation Performance
              </TabsTrigger>
              <TabsTrigger value="details">Detailed Results</TabsTrigger>
            </TabsList>

            <TabsContent value="predictions" className="space-y-4">
              <h2 className="text-2xl font-bold mt-4">Prediction Results</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {apiResponse.predictions.map((pred: any, idx: number) => (
                  <Card key={idx}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{pred.dataset}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">
                        {pred.xgb_average.toFixed(2)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {pred.percentage.toFixed(2)}% of total allocation
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        MSE: {pred.results.XGBoost.mse.toFixed(4)}
                      </p>
                      {pred.entry_size && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Entry Size: {pred.entry_size} KB
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="performance">
              {parsedResults ? (
                <div>
                  <h2 className="text-2xl font-bold mb-4">
                    Memory Allocation Performance
                  </h2>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {parsedResults.headers.map(
                            (header: string, idx: number) => (
                              <TableHead key={idx}>{header}</TableHead>
                            )
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedResults.data.map(
                          (row: string[], rowIdx: number) => (
                            <TableRow key={rowIdx}>
                              {row.map((cell, cellIdx) => (
                                <TableCell key={cellIdx}>{cell}</TableCell>
                              ))}
                            </TableRow>
                          )
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <InfoIcon className="mx-auto h-8 w-8 mb-2" />
                  <p>No allocation performance data available</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="details">
              <h2 className="text-2xl font-bold mb-4">Detailed Results</h2>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="detailed-predictions">
                  <AccordionTrigger>
                    Detailed Model Predictions
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-6">
                      {apiResponse.predictions.map((pred: any, idx: number) => (
                        <div key={idx} className="space-y-2">
                          <h3 className="text-lg font-semibold">
                            {pred.dataset}
                            {pred.entry_size && (
                              <span className="text-sm text-muted-foreground ml-2">
                                ({pred.entry_size} KB per entry)
                              </span>
                            )}
                          </h3>
                          {Object.entries(pred.results).map(
                            ([modelName, modelResults]: [string, any]) => (
                              <div key={modelName} className="ml-4 space-y-1">
                                <p className="font-medium">{modelName}:</p>
                                <p className="text-sm">
                                  MSE: {modelResults.mse.toFixed(4)}
                                </p>
                                <p className="text-sm">
                                  Predictions:{" "}
                                  {modelResults.predictions
                                    .map((p: number) => p.toFixed(2))
                                    .join(", ")}
                                </p>
                              </div>
                            )
                          )}
                          <Separator className="my-4" />
                        </div>
                      ))}
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
