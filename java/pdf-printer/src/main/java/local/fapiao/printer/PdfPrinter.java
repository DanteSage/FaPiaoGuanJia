package local.fapiao.printer;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.printing.PDFPrintable;
import org.apache.pdfbox.printing.Scaling;

import javax.print.PrintService;
import javax.print.PrintServiceLookup;
import java.awt.print.Book;
import java.awt.print.PageFormat;
import java.awt.print.Paper;
import java.awt.print.PrinterJob;
import java.io.File;

   
                            
                                 
   
                                                    
   
      
                               
                                       
                      
   
       
                  
             
              
               
               
             
   
public class PdfPrinter {

    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("用法: java -jar pdf-printer.jar <pdf路径> [打印机名] [份数]");
            System.exit(1);
        }

        String pdfPath = args[0];
                       
        String printerName = args.length > 1 && !args[1].isEmpty() ? args[1] : null;
        int copies = PrintOptionNormalizer.normalizeCopies(args.length > 2 ? args[2] : null);

        File pdfFile = new File(pdfPath);
        if (!pdfFile.exists() || !pdfFile.isFile()) {
            System.err.println("文件不存在: " + pdfPath);
            System.exit(2);
        }

        try {
            printPdf(pdfFile, printerName, copies);
        } catch (PrintCancelledException e) {
            System.err.println("用户取消打印");
            System.exit(4);
        } catch (PrinterNotFoundException e) {
            System.err.println("打印机未找到: " + printerName);
            System.exit(3);
        } catch (Exception e) {
            System.err.println("打印失败: " + e.getMessage());
            e.printStackTrace();
            System.exit(5);
        }

        System.out.println("打印完成");
        System.exit(0);
    }

    private static void printPdf(File pdfFile, String printerName, int copies) throws Exception {
        try (PDDocument document = PDDocument.load(pdfFile)) {
            PrinterJob job = PrinterJob.getPrinterJob();
            
                                                                    
                                              
                                    
            PDFPrintable printable = new PDFPrintable(document, Scaling.ACTUAL_SIZE, false, 0, true);
            
                                           
            Book book = new Book();
            int pageCount = document.getNumberOfPages();
            
            for (int i = 0; i < pageCount; i++) {
                PDPage page = document.getPage(i);
                PDRectangle mediaBox = page.getMediaBox();
                
                                                 
                float widthPt = mediaBox.getWidth();
                float heightPt = mediaBox.getHeight();
                
                         
                int rotation = page.getRotation();
                if (rotation == 90 || rotation == 270) {
                    float temp = widthPt;
                    widthPt = heightPt;
                    heightPt = temp;
                }
                
                                        
                Paper paper = new Paper();
                paper.setSize(widthPt, heightPt);
                               
                paper.setImageableArea(0, 0, widthPt, heightPt);
                
                PageFormat pageFormat = new PageFormat();
                pageFormat.setPaper(paper);
                pageFormat.setOrientation(PageFormat.PORTRAIT);
                
                book.append(printable, pageFormat);
            }
            
            job.setPageable(book);
            job.setCopies(copies);

                             
            if (printerName != null && !printerName.isEmpty()) {
                PrintService targetPrinter = findPrinter(printerName);
                if (targetPrinter != null) {
                    job.setPrintService(targetPrinter);
                } else {
                    throw new PrinterNotFoundException(printerName);
                }
                job.print();
            } else {
                boolean userConfirmed = job.printDialog();
                if (!userConfirmed) {
                    throw new PrintCancelledException();
                }
                job.print();
            }
        }
    }

    private static PrintService findPrinter(String name) {
        PrintService[] services = PrintServiceLookup.lookupPrintServices(null, null);
        for (PrintService service : services) {
            if (PrintOptionNormalizer.matchesPrinterName(service.getName(), name)) {
                return service;
            }
        }
        return null;
    }

    static int normalizeCopies(String rawValue) {
        return PrintOptionNormalizer.normalizeCopies(rawValue);
    }

    static class PrintCancelledException extends Exception {
        PrintCancelledException() {
            super("User cancelled print");
        }
    }

    static class PrinterNotFoundException extends Exception {
        PrinterNotFoundException(String name) {
            super("Printer not found: " + name);
        }
    }
}
